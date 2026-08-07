const prisma = require('../config/prisma');
const { ok, created, notFound, fail } = require('../utils/response');
const { diaDaSemana, hojeISO, paraHHmm, paraMinutos } = require('../utils/date');
const { gerarHorariosDisponiveis } = require('../utils/slots');
const { obterIntervalosOcupados, criarAgendamentoSeguro } = require('./appointments.controller');
const { normalizarTelefone, registrarOuAtualizarCliente } = require('./clients.controller');

function semSenha(barbeiro) {
  const { senhaHash, ...resto } = barbeiro;
  return resto;
}

async function buscarBarbeiroPorSlug(slug) {
  const barbeiro = await prisma.barbeiro.findUnique({ where: { slug } });
  return barbeiro ? semSenha(barbeiro) : null;
}

/** Campos públicos de um funcionário (sem dados internos como folgas/expediente). */
function funcionarioPublico(f) {
  return {
    id: f.id,
    nome: f.nome,
    foto: f.foto || '',
    especialidade: f.especialidade || '',
    avaliacao: f.avaliacao,
  };
}

/**
 * Expediente do dia a ser usado para um funcionário: o dele próprio, se tiver
 * um definido, senão o expediente geral da barbearia. Também verifica folga.
 */
function expedienteDoDia(barbeiro, funcionario, dataISO) {
  const diaSemana = diaDaSemana(dataISO);

  if (funcionario) {
    if (Array.isArray(funcionario.folgas) && funcionario.folgas.includes(dataISO)) return null;
    if (funcionario.expediente && funcionario.expediente[diaSemana]) {
      return funcionario.expediente[diaSemana];
    }
  }
  return barbeiro.expediente?.[diaSemana] || null;
}

/** GET /api/barbearias — diretório público (página "encontrar", sem link direto) */
async function listarBarbearias(req, res, next) {
  try {
    const barbearias = await prisma.barbeiro.findMany({
      where: {
        assinaturaAtiva: true,
        OR: [{ assinaturaValidaAte: null }, { assinaturaValidaAte: { gt: new Date() } }],
      },
      select: {
        slug: true,
        nomeBarbearia: true,
        endereco: true,
        logoUrl: true,
        corTema: true,
      },
      orderBy: { nomeBarbearia: 'asc' },
    });
    return ok(res, barbearias, 'Barbearias carregadas.');
  } catch (err) {
    next(err);
  }
}

/** GET /api/public/:slug — dados públicos da barbearia + serviços ativos + equipe */
async function obterBarbearia(req, res, next) {
  try {
    const barbeiro = await buscarBarbeiroPorSlug(req.params.slug);
    if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');

    const assinaturaExpirada = barbeiro.assinaturaValidaAte && new Date(barbeiro.assinaturaValidaAte) < new Date();
    if (!barbeiro.assinaturaAtiva || assinaturaExpirada) {
      return fail(res, 'Esta barbearia está temporariamente indisponível para agendamentos.', 402);
    }

    const [servicos, funcionarios] = await Promise.all([
      prisma.servico.findMany({ where: { barbeiroId: barbeiro.id, ativo: true }, orderBy: { ordem: 'asc' } }),
      prisma.funcionario.findMany({ where: { barbeiroId: barbeiro.id, ativo: true }, orderBy: { ordem: 'asc' } }),
    ]);

    return ok(res, {
      nomeBarbearia: barbeiro.nomeBarbearia,
      slug: barbeiro.slug,
      tipoSalao: barbeiro.tipoSalao || 'masculino',
      endereco: barbeiro.endereco,
      telefone: barbeiro.telefone,
      logoUrl: barbeiro.logoUrl,
      corTema: barbeiro.corTema,
      expediente: barbeiro.expediente,
      servicos,
      funcionarios: funcionarios.map(funcionarioPublico), // lista vazia = barbearia não usa seleção de profissional
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/public/:slug/horarios?data=YYYY-MM-DD&servicoId=(opcional)&funcionarioId=(opcional) */
async function obterHorariosDisponiveis(req, res, next) {
  try {
    const { data, servicoId, funcionarioId } = req.query;
    if (!data) return fail(res, 'Informe a data.', 422);

    if (data < hojeISO()) return ok(res, [], 'Não é possível agendar em datas passadas.');

    const barbeiro = await buscarBarbeiroPorSlug(req.params.slug);
    if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');

    // Sem serviço ainda escolhido (fluxo em que a data/hora vem antes do serviço):
    // usamos a granularidade da agenda como duração de sondagem. A duração real
    // do serviço é revalidada quando o cliente efetivamente escolhe o serviço
    // e novamente no momento de criar o agendamento.
    let duracaoServico = barbeiro.config?.intervaloEntreSlots || 15;
    if (servicoId) {
      const servico = await prisma.servico.findFirst({ where: { id: servicoId, barbeiroId: barbeiro.id } });
      if (!servico) return notFound(res, 'Serviço não encontrado.');
      duracaoServico = servico.duracaoMinutos;
    }

    let funcionario = null;
    if (funcionarioId) {
      funcionario = await prisma.funcionario.findFirst({ where: { id: funcionarioId, barbeiroId: barbeiro.id, ativo: true } });
      if (!funcionario) return notFound(res, 'Profissional não encontrado.');
    }

    const expedienteHoje = expedienteDoDia(barbeiro, funcionario, data);
    if (!expedienteHoje || expedienteHoje.fechado) {
      return ok(res, [], 'Sem expediente nesta data.');
    }

    const ocupados = await obterIntervalosOcupados(barbeiro.id, data, funcionarioId || null);
    const ehHoje = data === hojeISO();
    const antecedencia = barbeiro.config?.antecedenciaMinimaMinutos || 60;

    const agora = new Date();
    const agoraComAntecedencia = paraHHmm(agora.getHours() * 60 + agora.getMinutes() + antecedencia);

    const horarios = gerarHorariosDisponiveis({
      expediente: expedienteHoje,
      duracaoServico,
      ocupados,
      intervaloEntreSlots: barbeiro.config?.intervaloEntreSlots || 15,
      agora: agoraComAntecedencia,
      ehHoje,
    });

    return ok(res, horarios, 'Horários carregados.');
  } catch (err) {
    next(err);
  }
}

/** POST /api/public/:slug/agendar */
async function criarAgendamentoPublico(req, res, next) {
  try {
    const { nome, telefone, observacoes, servicoId, descricaoServico, data, horaInicio, funcionarioId } = req.body;

    if (!nome || !telefone || (!servicoId && !descricaoServico) || !data || !horaInicio) {
      return fail(res, 'Preencha nome, telefone, o que deseja, data e horário.', 422);
    }
    if (normalizarTelefone(telefone).length < 9) {
      return fail(res, 'Informe um número de telefone válido.', 422);
    }
    if (data < hojeISO()) {
      return fail(res, 'Não é possível agendar em datas passadas.', 422);
    }

    const barbeiro = await buscarBarbeiroPorSlug(req.params.slug);
    if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');
    const assinaturaExpirada = barbeiro.assinaturaValidaAte && new Date(barbeiro.assinaturaValidaAte) < new Date();
    if (!barbeiro.assinaturaAtiva || assinaturaExpirada) {
      return fail(res, 'Esta barbearia está temporariamente indisponível para agendamentos.', 402);
    }

    // Serviço pré-cadastrado (fluxo antigo) OU descrição livre digitada pelo
    // cliente (fluxo atual): sem preço/duração conhecidos, a barbearia ajusta
    // isso manualmente no painel depois de ler o pedido.
    let servico = null;
    if (servicoId) {
      servico = await prisma.servico.findFirst({ where: { id: servicoId, barbeiroId: barbeiro.id } });
      if (!servico) return notFound(res, 'Serviço não encontrado.');
    }
    const duracaoMinutos = servico ? servico.duracaoMinutos : (barbeiro.config?.duracaoPadraoMinutos || barbeiro.config?.intervaloEntreSlots || 30);
    const preco = servico ? servico.preco : 0;
    const servicoNome = servico ? servico.nome : descricaoServico;

    let funcionario = null;
    if (funcionarioId) {
      funcionario = await prisma.funcionario.findFirst({ where: { id: funcionarioId, barbeiroId: barbeiro.id, ativo: true } });
      if (!funcionario) return notFound(res, 'Profissional não encontrado.');
      if (servico && servico.funcionarioId && servico.funcionarioId !== funcionarioId) {
        return fail(res, 'Este serviço não está disponível com o profissional selecionado.', 422);
      }
    }

    // Revalida o expediente/folga no momento da escrita, não só quando os horários foram exibidos
    const expedienteHoje = expedienteDoDia(barbeiro, funcionario, data);
    if (!expedienteHoje || expedienteHoje.fechado) {
      return fail(res, 'Fora do horário de funcionamento nesta data.', 422);
    }

    const horaFim = paraHHmm(paraMinutos(horaInicio) + duracaoMinutos);

    const dentroDoExpediente = paraMinutos(horaInicio) >= paraMinutos(expedienteHoje.abre)
      && paraMinutos(horaFim) <= paraMinutos(expedienteHoje.fecha);
    if (!dentroDoExpediente) {
      return fail(res, 'Horário fora do expediente para este serviço.', 422);
    }

    const novo = {
      clienteNome: nome,
      clienteTelefone: telefone,
      clienteTelefoneNormalizado: normalizarTelefone(telefone),
      clienteEmail: '',
      servicoId: servicoId || null,
      servicoNome,
      funcionarioId: funcionarioId || null,
      funcionarioNome: funcionario ? funcionario.nome : null,
      preco,
      duracaoMinutos,
      data, horaInicio, horaFim,
      status: 'pendente',
      observacoes: observacoes || '',
      origem: 'publico',
    };

    const agendamento = await criarAgendamentoSeguro(barbeiro.id, novo);
    await registrarOuAtualizarCliente(barbeiro.id, { nome, telefone, email: '' });

    return created(res, {
      ...agendamento,
      nomeBarbearia: barbeiro.nomeBarbearia,
      enderecoBarbearia: barbeiro.endereco,
    }, 'Agendamento confirmado!');
  } catch (err) {
    if (err.status === 409) return fail(res, err.message, 409);
    next(err);
  }
}

module.exports = { listarBarbearias, obterBarbearia, obterHorariosDisponiveis, criarAgendamentoPublico };
