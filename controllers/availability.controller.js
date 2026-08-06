const prisma = require('../config/prisma');
const { ok, created, notFound, fail } = require('../utils/response');

async function obterExpediente(req, res) {
  return ok(res, req.barbeiro.expediente || {}, 'Expediente carregado.');
}

async function atualizarExpediente(req, res, next) {
  try {
    const { expediente } = req.body;
    if (!expediente) return fail(res, 'Envie o objeto de expediente.', 422);

    await prisma.barbeiro.update({
      where: { id: req.barbeiro.id },
      data: { expediente },
    });

    return ok(res, expediente, 'Expediente atualizado.');
  } catch (err) {
    next(err);
  }
}

async function listarBloqueios(req, res, next) {
  try {
    const { de, ate } = req.query;
    const where = { barbeiroId: req.barbeiro.id };

    // Um bloqueio recorrente não tem `data` e deve continuar aparecendo
    // independente do filtro de período — por isso o OR com `data: null`.
    if (de || ate) {
      const filtroData = {};
      if (de) filtroData.gte = de;
      if (ate) filtroData.lte = ate;
      where.OR = [{ data: null }, { data: filtroData }];
    }

    const bloqueios = await prisma.bloqueio.findMany({ where });
    return ok(res, bloqueios, 'Bloqueios carregados.');
  } catch (err) {
    next(err);
  }
}

async function criarBloqueio(req, res, next) {
  try {
    const { data, horaInicio, horaFim, diaTodo, motivo, recorrente, diaSemana, funcionarioId } = req.body;

    if (!recorrente && !data) {
      return fail(res, 'Informe a data do bloqueio ou marque como recorrente.', 422);
    }
    if (!diaTodo && (!horaInicio || !horaFim)) {
      return fail(res, 'Informe hora de início e fim, ou marque como dia todo.', 422);
    }

    const novo = await prisma.bloqueio.create({
      data: {
        barbeiroId: req.barbeiro.id,
        funcionarioId: funcionarioId || null, // null = bloqueia a barbearia inteira
        data: data || null,
        horaInicio: diaTodo ? '00:00' : horaInicio,
        horaFim: diaTodo ? '23:59' : horaFim,
        diaTodo: !!diaTodo,
        motivo: motivo || 'Indisponível',
        recorrente: !!recorrente,
        diaSemana: recorrente ? diaSemana : null,
      },
    });

    return created(res, novo, 'Bloqueio criado.');
  } catch (err) {
    next(err);
  }
}

async function removerBloqueio(req, res, next) {
  try {
    const { id } = req.params;
    const { count } = await prisma.bloqueio.deleteMany({ where: { id, barbeiroId: req.barbeiro.id } });
    if (count === 0) return notFound(res, 'Bloqueio não encontrado.');
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
