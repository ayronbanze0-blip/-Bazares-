const db = require('../config/db');
const { gerarId } = require('../utils/id');
const { ok, created, notFound, fail } = require('../utils/response');

async function obterExpediente(req, res) {
  return ok(res, req.barbeiro.expediente || {}, 'Expediente carregado.');
}

async function atualizarExpediente(req, res, next) {
  try {
    const { expediente } = req.body;
    if (!expediente) return fail(res, 'Envie o objeto de expediente.', 422);

    const dados = db.ler();
    const barbeiro = dados.barbeiros.find((b) => b.id === req.barbeiro.id);
    barbeiro.expediente = expediente;
    barbeiro.atualizadoEm = new Date().toISOString();

    await db.escrever(dados);
    return ok(res, expediente, 'Expediente atualizado.');
  } catch (err) {
    next(err);
  }
}

async function listarBloqueios(req, res, next) {
  try {
    const { de, ate } = req.query;
    const dados = db.ler();
    let bloqueios = dados.bloqueios.filter((b) => b.barbeiroId === req.barbeiro.id);
    if (de) bloqueios = bloqueios.filter((b) => !b.data || b.data >= de);
    if (ate) bloqueios = bloqueios.filter((b) => !b.data || b.data <= ate);
    return ok(res, bloqueios, 'Bloqueios carregados.');
  } catch (err) {
    next(err);
  }
}

async function criarBloqueio(req, res, next) {
  try {
    const { data, horaInicio, horaFim, diaTodo, motivo, recorrente, diaSemana } = req.body;

    if (!recorrente && !data) {
      return fail(res, 'Informe a data do bloqueio ou marque como recorrente.', 422);
    }
    if (!diaTodo && (!horaInicio || !horaFim)) {
      return fail(res, 'Informe hora de início e fim, ou marque como dia todo.', 422);
    }

    const novo = {
      id: gerarId(),
      barbeiroId: req.barbeiro.id,
      data: data || null,
      horaInicio: diaTodo ? '00:00' : horaInicio,
      horaFim: diaTodo ? '23:59' : horaFim,
      diaTodo: !!diaTodo,
      motivo: motivo || 'Indisponível',
      recorrente: !!recorrente,
      diaSemana: recorrente ? diaSemana : null,
      criadoEm: new Date().toISOString(),
    };

    const dados = db.ler();
    dados.bloqueios.push(novo);
    await db.escrever(dados);

    return created(res, novo, 'Bloqueio criado.');
  } catch (err) {
    next(err);
  }
}

async function removerBloqueio(req, res, next) {
  try {
    const { id } = req.params;
    const dados = db.ler();
    const indice = dados.bloqueios.findIndex((b) => b.id === id && b.barbeiroId === req.barbeiro.id);
    if (indice === -1) return notFound(res, 'Bloqueio não encontrado.');

    dados.bloqueios.splice(indice, 1);
    await db.escrever(dados);
    return ok(res, null, 'Bloqueio removido.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  obterExpediente,
  atualizarExpediente,
  listarBloqueios,
  criarBloqueio,
  removerBloqueio,
};
