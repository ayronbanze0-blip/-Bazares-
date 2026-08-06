const prisma = require('../config/prisma');
const { ok, created, notFound, fail } = require('../utils/response');

async function listar(req, res, next) {
  try {
    const { funcionarioId } = req.query;

    const where = { barbeiroId: req.barbeiro.id };
    if (funcionarioId) {
      // Serviços genéricos (sem funcionário específico) + os exclusivos deste funcionário
      where.OR = [{ funcionarioId: null }, { funcionarioId }];
    }

    const servicos = await prisma.servico.findMany({ where, orderBy: { ordem: 'asc' } });
    return ok(res, servicos, 'Serviços carregados.');
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const { nome, descricao, preco, duracaoMinutos, funcionarioId } = req.body;
    if (!nome || preco == null || !duracaoMinutos) {
      return fail(res, 'Informe nome, preço e duração do serviço.', 422);
    }

    const totalAtual = await prisma.servico.count({ where: { barbeiroId: req.barbeiro.id } });

    const novo = await prisma.servico.create({
      data: {
        barbeiroId: req.barbeiro.id,
        funcionarioId: funcionarioId || null, // null = disponível para qualquer funcionário
        nome,
        descricao: descricao || '',
        preco: Number(preco),
        duracaoMinutos: Number(duracaoMinutos),
        ativo: true,
        ordem: totalAtual,
      },
    });

    return created(res, novo, 'Serviço criado.');
  } catch (err) {
    next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    const { id } = req.params;

    const camposPermitidos = ['nome', 'descricao', 'preco', 'duracaoMinutos', 'ativo', 'ordem', 'funcionarioId'];
    const dadosAtualizados = {};
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) dadosAtualizados[campo] = req.body[campo];
    }

    const { count } = await prisma.servico.updateMany({
      where: { id, barbeiroId: req.barbeiro.id },
      data: dadosAtualizados,
    });
    if (count === 0) return notFound(res, 'Serviço não encontrado.');

    const servico = await prisma.servico.findUnique({ where: { id } });
    return ok(res, servico, 'Serviço atualizado.');
  } catch (err) {
    next(err);
  }
}

async function remover(req, res, next) {
  try {
    const { id } = req.params;
    const { count } = await prisma.servico.deleteMany({ where: { id, barbeiroId: req.barbeiro.id } });
    if (count === 0) return notFound(res, 'Serviço não encontrado.');
    return ok(res, null, 'Serviço removido.');
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, criar, atualizar, remover };
