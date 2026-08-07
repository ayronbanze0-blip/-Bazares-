const prisma = require('../config/prisma');
const { ok, created, notFound, fail } = require('../utils/response');
const {
  diaDaSemana, paraMinutos, paraHHmm, intervalosSeSobrepoe,
  inicioFimDaSemana, inicioFimDoMes,
} = require('../utils/date');
const { normalizarTelefone, registrarOuAtualizarCliente } = require('./clients.controller');

const STATUS_OCUPA_HORARIO = ['pendente', 'confirmado', 'concluido'];

/**
 * Retorna todos os intervalos já ocupados numa data para um barbeiro:
 * agendamentos ativos + bloqueios manuais (incluindo recorrentes que caem no dia).
 *
 * Quando `funcionarioId` é informado, considera apenas os agendamentos/bloqueios
 * desse funcionário específico + bloqueios gerais da barbearia (sem funcionário
 * definido). Sem `funcionarioId`, mantém o comportamento antigo: escopo por
 * barbearia inteira (barbearias que não usam funcionários cadastrados).
 */
async function obterIntervalosOcupados(barbeiroId, dataISO, funcionarioId = null, tx = prisma) {
  const ondeAgendamentos = { barbeiroId, data: dataISO, status: { in: STATUS_OCUPA_HORARIO } };
  if (funcionarioId) ondeAgendamentos.funcionarioId = funcionarioId;

  const agendamentos = await tx.agendamento.findMany({ where: ondeAgendamentos });
  const ocupados = agendamentos.map((a) => ({ inicio: a.horaInicio, fim: a.horaFim, tipo: 'agendamento' }));

  const ondeBloqueios = { barbeiroId };
  if (funcionarioId) ondeBloqueios.OR = [{ funcionarioId: null }, { funcionarioId }];

  const bloqueios = await tx.bloqueio.findMany({ where: ondeBloqueios });
  const diaSemana = diaDaSemana(dataISO);

  bloqueios.forEach((b) => {
    const aplicaHoje = (b.recorrente && b.diaSemana === diaSemana) || (!b.recorrente && b.data === dataISO);
    if (aplicaHoje) ocupados.push({ inicio: b.horaInicio, fim: b.horaFim, tipo: 'bloqueio', motivo: b.motivo });
  });

  return ocupados;
}

/**
 * Cria um agendamento validando conflito de horário dentro de uma transação
 * real do banco, evitando condição de corrida quando dois clientes tentam
 * reservar o mesmo horário ao mesmo tempo.
 */
async function criarAgendamentoSeguro(barbeiroId, dadosAgendamento) {
  return prisma.$transaction(async (tx) => {
    const { data, horaInicio, horaFim, funcionarioId } = dadosAgendamento;

    const ondeConflito = { barbeiroId, data, status: { in: STATUS_OCUPA_HORARIO } };
    if (funcionarioId) ondeConflito.funcionarioId = funcionarioId;

    const candidatos = await tx.agendamento.findMany({ where: ondeConflito });
    const conflito = candidatos.some((a) =>
      intervalosSeSobrepoe(
        paraMinutos(horaInicio), paraMinutos(horaFim),
        paraMinutos(a.horaInicio), paraMinutos(a.horaFim)
      )
    );

    if (conflito) {
      const erro = new Error('Este horário acabou de ser reservado. Escolha outro horário.');
      erro.status = 409;
      throw erro;
    }

    return tx.agendamento.create({ data: { barbeiroId, ...dadosAgendamento } });
  });
}

async function listar(req, res, next) {
  try {
    const { visao = 'dia', data, status, funcionarioId } = req.query;
    const barbeiroId = req.barbeiro.id;

    let de = data;
    let ate = data;

    if (visao === 'semana' && data) {
      const { inicio, fim } = inicioFimDaSemana(data);
      de = inicio; ate = fim;
    } else if (visao === 'mes' && data) {
      const [ano, mes] = data.split('-').map(Number);
      const { inicio, fim } = inicioFimDoMes(ano, mes);
      de = inicio; ate = fim;
    }

    const where = { barbeiroId };
    if (de) where.data = { ...(where.data || {}), gte: de };
    if (ate) where.data = { ...(where.data || {}), lte: ate };
    if (status) where.status = status;
    if (funcionarioId) where.funcionarioId = funcionarioId;

    const agendamentos = await prisma.agendamento.findMany({
      where,
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    });

    return ok(res, agendamentos, 'Agendamentos carregados.');
  } catch (err) {
    next(err);
  }
}

async function criarManual(req, res, next) {
  try {
    const barbeiroId = req.barbeiro.id;
    const { clienteNome, clienteTelefone, clienteEmail, servicoId, descricaoServico, preco, data, horaInicio, observacoes, funcionarioId } = req.body;

    if (!clienteNome || !clienteTelefone || (!servicoId && !descricaoServico) || !data || !horaInicio) {
      return fail(res, 'Preencha cliente, o que vai fazer, data e horário.', 422);
    }

    // Serviço pré-cadastrado (grelha) OU descrição livre escrita pelo barbeiro
    // (quando não há serviços cadastrados) — nesse caso o preço é escolhido
    // manualmente pelo barbeiro, já que não há tabela de preços a consultar.
    let servico = null;
    if (servicoId) {
      servico = await prisma.servico.findFirst({ where: { id: servicoId, barbeiroId } });
      if (!servico) return notFound(res, 'Serviço não encontrado.');
    } else if (preco == null || Number(preco) < 0) {
      return fail(res, 'Informe o preço deste atendimento.', 422);
    }

    const barbeiroConfig = req.barbeiro.config;
    const duracaoMinutos = servico ? servico.duracaoMinutos : (barbeiroConfig?.duracaoPadraoMinutos || barbeiroConfig?.intervaloEntreSlots || 30);
    const precoFinal = servico ? servico.preco : Number(preco);
    const servicoNome = servico ? servico.nome : descricaoServico;

    let funcionarioNome = null;
    if (funcionarioId) {
      const funcionario = await prisma.funcionario.findFirst({ where: { id: funcionarioId, barbeiroId } });
      if (!funcionario) return notFound(res, 'Funcionário não encontrado.');
      funcionarioNome = funcionario.nome;
    }

    const horaFim = paraHHmm(paraMinutos(horaInicio) + duracaoMinutos);

    const novo = {
      clienteNome,
      clienteTelefone,
      clienteTelefoneNormalizado: normalizarTelefone(clienteTelefone),
      clienteEmail: clienteEmail || '',
      servicoId: servicoId || null,
      servicoNome,
      funcionarioId: funcionarioId || null,
      funcionarioNome,
      preco: precoFinal,
      duracaoMinutos,
      data, horaInicio, horaFim,
      status: 'confirmado',
      observacoes: observacoes || '',
      origem: 'manual',
    };

    const agendamento = await criarAgendamentoSeguro(barbeiroId, novo);
    await registrarOuAtualizarCliente(barbeiroId, { nome: clienteNome, telefone: clienteTelefone, email: clienteEmail });

    return created(res, agendamento, 'Agendamento criado.');
  } catch (err) {
    if (err.status === 409) return fail(res, err.message, 409);
    next(err);
  }
}

async function atualizarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const statusValidos = ['pendente', 'confirmado', 'concluido', 'cancelado'];
    if (!statusValidos.includes(status)) return fail(res, 'Status inválido.', 422);

    const { count } = await prisma.agendamento.updateMany({
      where: { id, barbeiroId: req.barbeiro.id },
      data: { status },
    });
    if (count === 0) return notFound(res, 'Agendamento não encontrado.');

    const agendamento = await prisma.agendamento.findUnique({ where: { id } });
    return ok(res, agendamento, 'Status atualizado.');
  } catch (err) {
    next(err);
  }
}

async function reagendar(req, res, next) {
  try {
    const { id } = req.params;
    const { data, horaInicio } = req.body;
    if (!data || !horaInicio) return fail(res, 'Informe nova data e horário.', 422);

    const resultado = await prisma.$transaction(async (tx) => {
      const agendamento = await tx.agendamento.findFirst({ where: { id, barbeiroId: req.barbeiro.id } });
      if (!agendamento) {
        const erro = new Error('Agendamento não encontrado.');
        erro.status = 404;
        throw erro;
      }

      const horaFim = paraHHmm(paraMinutos(horaInicio) + agendamento.duracaoMinutos);

      const ondeConflito = { barbeiroId: req.barbeiro.id, data, status: { in: STATUS_OCUPA_HORARIO }, id: { not: id } };
      if (agendamento.funcionarioId) ondeConflito.funcionarioId = agendamento.funcionarioId;

      const candidatos = await tx.agendamento.findMany({ where: ondeConflito });
      const conflito = candidatos.some((a) =>
        intervalosSeSobrepoe(paraMinutos(horaInicio), paraMinutos(horaFim), paraMinutos(a.horaInicio), paraMinutos(a.horaFim))
      );

      if (conflito) {
        const erro = new Error('Novo horário indisponível.');
        erro.status = 409;
        throw erro;
      }

      return tx.agendamento.update({
        where: { id },
        data: { data, horaInicio, horaFim, status: 'confirmado' },
      });
    });

    return ok(res, resultado, 'Agendamento reagendado.');
  } catch (err) {
    if (err.status === 404) return notFound(res, err.message);
    if (err.status === 409) return fail(res, err.message, 409);
    next(err);
  }
}

async function remover(req, res, next) {
  try {
    const { id } = req.params;
    const { count } = await prisma.agendamento.deleteMany({ where: { id, barbeiroId: req.barbeiro.id } });
    if (count === 0) return notFound(res, 'Agendamento não encontrado.');
    return ok(res, null, 'Agendamento removido.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar, criarManual, atualizarStatus, reagendar, remover,
  obterIntervalosOcupados, criarAgendamentoSeguro,
};
