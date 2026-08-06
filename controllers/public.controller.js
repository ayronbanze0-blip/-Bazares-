const db = require('../config/db');
const { ok, created, notFound, fail } = require('../utils/response');
const { diaDaSemana, hojeISO, paraHHmm, paraMinutos } = require('../utils/date');
const { gerarHorariosDisponiveis } = require('../utils/slots');
const { obterIntervalosOcupados, criarAgendamentoSeguro } = require('./appointments.controller');
const { normalizarTelefone, registrarOuAtualizarCliente } = require('./clients.controller');

function semSenha(barbeiro) {
  const { senhaHash, ...resto } = barbeiro;
  return resto;
}

function buscarBarbeiroPorSlug(slug) {
  const dados = db.ler();
  const barbeiro = dados.barbeiros.find((b) => b.slug === slug);
  return { dados, barbeiro: barbeiro ? semSenha(barbeiro) : null };
}

/** GET /api/public/:slug — dados públicos da barbearia + serviços ativos */
async function obterBarbearia(req, res, next) {
  try {
    const { dados, barbeiro } = buscarBarbeiroPorSlug(req.params.slug);
    if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');

    const servicos = dados.servicos
      .filter((s) => s.barbeiroId === barbeiro.id && s.ativo)
      .sort((a, b) => a.ordem - b.ordem);

    return ok(res, {
      nomeBarbearia: barbeiro.nomeBarbearia,
      slug: barbeiro.slug,
      endereco: barbeiro.endereco,
      telefone: barbeiro.telefone,
      logoUrl: barbeiro.logoUrl,
      corTema: barbeiro.corTema,
      expediente: barbeiro.expediente,
      servicos,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/public/:slug/horarios?data=YYYY-MM-DD&servicoId=... */
async function obterHorariosDisponiveis(req, res, next) {
  try {
    const { data, servicoId } = req.query;
    if (!data || !servicoId) return fail(res, 'Informe data e serviço.', 422);

    const { dados, barbeiro } = buscarBarbeiroPorSlug(req.params.slug);
    if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');

    const servico = dados.servicos.find((s) => s.id === servicoId && s.barbeiroId === barbeiro.id);
    if (!servico) return notFound(res, 'Serviço não encontrado.');

    const diaSemana = diaDaSemana(data);
    const expedienteDoDia = barbeiro.expediente?.[diaSemana];

    if (!expedienteDoDia || expedienteDoDia.fechado) {
      return ok(res, [], 'A barbearia está fechada nesta data.');
    }

    const ocupados = obterIntervalosOcupados(dados, barbeiro.id, data);
    const ehHoje = data === hojeISO();
    const antecedencia = barbeiro.config?.antecedenciaMinimaMinutos || 60;

    const agora = new Date();
    const agoraComAntecedencia = paraHHmm(agora.getHours() * 60 + agora.getMinutes() + antecedencia);

    const horarios = gerarHorariosDisponiveis({
      expediente: expedienteDoDia,
      duracaoServico: servico.duracaoMinutos,
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
    const { nome, telefone, email, observacoes, servicoId, data, horaInicio } = req.body;

    if (!nome || !telefone || !servicoId || !data || !horaInicio) {
      return fail(res, 'Preencha nome, telefone, serviço, data e horário.', 422);
    }
    if (normalizarTelefone(telefone).length < 9) {
      return fail(res, 'Informe um número de telefone válido.', 422);
    }

    const { dados, barbeiro } = buscarBarbeiroPorSlug(req.params.slug);
    if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');

    const servico = dados.servicos.find((s) => s.id === servicoId && s.barbeiroId === barbeiro.id);
    if (!servico) return notFound(res, 'Serviço não encontrado.');

    const horaFim = paraHHmm(paraMinutos(horaInicio) + servico.duracaoMinutos);

    const novo = {
      clienteNome: nome,
      clienteTelefone: telefone,
      clienteTelefoneNormalizado: normalizarTelefone(telefone),
      clienteEmail: email || '',
      servicoId,
      servicoNome: servico.nome,
      preco: servico.preco,
      duracaoMinutos: servico.duracaoMinutos,
      data, horaInicio, horaFim,
      status: 'pendente',
      observacoes: observacoes || '',
      origem: 'publico',
      criadoEm: new Date().toISOString(),
    };

    const agendamento = await criarAgendamentoSeguro(barbeiro.id, novo);
    await registrarOuAtualizarCliente(barbeiro.id, { nome, telefone, email });

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

module.exports = { obterBarbearia, obterHorariosDisponiveis, criarAgendamentoPublico };
