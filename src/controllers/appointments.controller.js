const db = require('../config/db');
const { gerarId } = require('../utils/id');
const { ok, created, notFound, fail } = require('../utils/response');
const {
  diaDaSemana, paraMinutos, paraHHmm, intervalosSeSobrepoe,
  inicioFimDaSemana, inicioFimDoMes,
} = require('../utils/date');
const { normalizarTelefone, registrarOuAtualizarCliente } = require('./clients.controller');

/**
 * Retorna todos os intervalos já ocupados numa data para um barbeiro:
 * agendamentos ativos + bloqueios manuais (incluindo recorrentes que caem no dia).
 */
function obterIntervalosOcupados(dados, barbeiroId, dataISO) {
  const ocupados = dados.agendamentos
    .filter((a) => a.barbeiroId === barbeiroId && a.data === dataISO && ['pendente', 'confirmado', 'concluido'].includes(a.status))
    .map((a) => ({ inicio: a.horaInicio, fim: a.horaFim, tipo: 'agendamento' }));

  const diaSemana = diaDaSemana(dataISO);

  dados.bloqueios
    .filter((b) => b.barbeiroId === barbeiroId)
    .forEach((b) => {
      const aplicaHoje = (b.recorrente && b.diaSemana === diaSemana) || (!b.recorrente && b.data === dataISO);
      if (aplicaHoje) ocupados.push({ inicio: b.horaInicio, fim: b.horaFim, tipo: 'bloqueio', motivo: b.motivo });
    });

  return ocupados;
}

async function listar(req, res, next) {
  try {
    const { visao = 'dia', data, status } = req.query;
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

    const dados = db.ler();
    let agendamentos = dados.agendamentos.filter((a) => a.barbeiroId === barbeiroId);
    if (de) agendamentos = agendamentos.filter((a) => a.data >= de);
    if (ate) agendamentos = agendamentos.filter((a) => a.data <= ate);
    if (status) agendamentos = agendamentos.filter((a) => a.status === status);

    agendamentos.sort((a, b) => (a.data + a.horaInicio).localeCompare(b.data + b.horaInicio));

    return ok(res, agendamentos, 'Agendamentos carregados.');
  } catch (err) {
    next(err);
  }
}

/**
 * Cria um agendamento validando conflito de horário dentro de uma "transação"
 * (fila serializada do db.js), evitando condição de corrida quando dois
 * clientes tentam reservar o mesmo horário ao mesmo tempo.
 */
async function criarAgendamentoSeguro(barbeiroId, dadosAgendamento) {
  return db.transacao((dados) => {
    const { data, horaInicio, horaFim } = dadosAgendamento;

    const conflito = dados.agendamentos.some((a) => {
      if (a.barbeiroId !== barbeiroId || a.data !== data) return false;
      if (!['pendente', 'confirmado', 'concluido'].includes(a.status)) return false;
      return intervalosSeSobrepoe(
        paraMinutos(horaInicio), paraMinutos(horaFim),
        paraMinutos(a.horaInicio), paraMinutos(a.horaFim)
      );
    });

    if (conflito) {
      const erro = new Error('Este horário acabou de ser reservado. Escolha outro horário.');
      erro.status = 409;
      throw erro;
    }

    const novo = { id: gerarId(), barbeiroId, ...dadosAgendamento };
    dados.agendamentos.push(novo);
    return novo;
  });
}

async function criarManual(req, res, next) {
  try {
    const barbeiroId = req.barbeiro.id;
    const { clienteNome, clienteTelefone, clienteEmail, servicoId, data, horaInicio, observacoes } = req.body;

    if (!clienteNome || !clienteTelefone || !servicoId || !data || !horaInicio) {
      return fail(res, 'Preencha cliente, serviço, data e horário.', 422);
    }

    const dadosAtuais = db.ler();
    const servico = dadosAtuais.servicos.find((s) => s.id === servicoId && s.barbeiroId === barbeiroId);
    if (!servico) return notFound(res, 'Serviço não encontrado.');

    const horaFim = paraHHmm(paraMinutos(horaInicio) + servico.duracaoMinutos);

    const novo = {
      clienteNome,
      clienteTelefone,
      clienteTelefoneNormalizado: normalizarTelefone(clienteTelefone),
      clienteEmail: clienteEmail || '',
      servicoId,
      servicoNome: servico.nome,
      preco: servico.preco,
      duracaoMinutos: servico.duracaoMinutos,
      data, horaInicio, horaFim,
      status: 'confirmado',
      observacoes: observacoes || '',
      origem: 'manual',
      criadoEm: new Date().toISOString(),
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

    const dados = db.ler();
    const agendamento = dados.agendamentos.find((a) => a.id === id && a.barbeiroId === req.barbeiro.id);
    if (!agendamento) return notFound(res, 'Agendamento não encontrado.');

    agendamento.status = status;
    agendamento.atualizadoEm = new Date().toISOString();
    await db.escrever(dados);

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

    const resultado = await db.transacao((dados) => {
      const agendamento = dados.agendamentos.find((a) => a.id === id && a.barbeiroId === req.barbeiro.id);
      if (!agendamento) {
        const erro = new Error('Agendamento não encontrado.');
        erro.status = 404;
        throw erro;
      }

      const horaFim = paraHHmm(paraMinutos(horaInicio) + agendamento.duracaoMinutos);

      const conflito = dados.agendamentos.some((a) => {
        if (a.id === id || a.barbeiroId !== req.barbeiro.id || a.data !== data) return false;
        if (!['pendente', 'confirmado', 'concluido'].includes(a.status)) return false;
        return intervalosSeSobrepoe(paraMinutos(horaInicio), paraMinutos(horaFim), paraMinutos(a.horaInicio), paraMinutos(a.horaFim));
      });

      if (conflito) {
        const erro = new Error('Novo horário indisponível.');
        erro.status = 409;
        throw erro;
      }

      agendamento.data = data;
      agendamento.horaInicio = horaInicio;
      agendamento.horaFim = horaFim;
      agendamento.status = 'confirmado';
      agendamento.atualizadoEm = new Date().toISOString();
      return agendamento;
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
    const dados = db.ler();
    const indice = dados.agendamentos.findIndex((a) => a.id === id && a.barbeiroId === req.barbeiro.id);
    if (indice === -1) return notFound(res, 'Agendamento não encontrado.');

    dados.agendamentos.splice(indice, 1);
    await db.escrever(dados);
    return ok(res, null, 'Agendamento removido.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar, criarManual, atualizarStatus, reagendar, remover,
  obterIntervalosOcupados, criarAgendamentoSeguro,
};
