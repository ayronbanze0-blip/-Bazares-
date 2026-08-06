const prisma = require('../config/prisma');
const { ok, created, notFound, fail } = require('../utils/response');

/**
 * Um "funcionário" é um barbeiro que trabalha na barbearia (a conta logada
 * representa a barbearia/dono). Se a barbearia não cadastrar nenhum
 * funcionário, o fluxo público de agendamento continua funcionando como
 * antes (sem passo de seleção de profissional).
 *
 * expediente/folgas são opcionais: quando não definidos, o motor de
 * horários usa o expediente geral da barbearia (req.barbeiro.expediente).
 */

async function listar(req, res, next) {
  try {
    const funcionarios = await prisma.funcionario.findMany({
      where: { barbeiroId: req.barbeiro.id },
      orderBy: { ordem: 'asc' },
    });
    return ok(res, funcionarios, 'Funcionários carregados.');
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const { nome, foto, especialidade, telefone, avaliacao, expediente, folgas } = req.body;
    if (!nome) return fail(res, 'Informe o nome do funcionário.', 422);

    const totalAtual = await prisma.funcionario.count({ where: { barbeiroId: req.barbeiro.id } });

    const novo = await prisma.funcionario.create({
      data: {
        barbeiroId: req.barbeiro.id,
        nome,
        foto: foto || '',
        especialidade: especialidade || '',
        telefone: telefone || '',
        avaliacao: avaliacao != null ? Number(avaliacao) : null,
        ativo: true,
        expediente: expediente || null, // null = usa o expediente geral da barbearia
        folgas: Array.isArray(folgas) ? folgas : [], // datas específicas (YYYY-MM-DD) de folga
        ordem: totalAtual,
      },
    });

    return created(res, novo, 'Funcionário adicionado.');
  } catch (err) {
    next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    const { id } = req.params;

    const camposPermitidos = [
      'nome', 'foto', 'especialidade', 'telefone', 'avaliacao',
      'ativo', 'expediente', 'folgas', 'ordem',
    ];
    const dadosAtualizados = {};
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) dadosAtualizados[campo] = req.body[campo];
    }

    const { count } = await prisma.funcionario.updateMany({
      where: { id, barbeiroId: req.barbeiro.id },
      data: dadosAtualizados,
    });
    if (count === 0) return notFound(res, 'Funcionário não encontrado.');

    const funcionario = await prisma.funcionario.findUnique({ where: { id } });
    return ok(res, funcionario, 'Funcionário atualizado.');
  } catch (err) {
    next(err);
  }
}

async function remover(req, res, next) {
  try {
    const { id } = req.params;

    const funcionario = await prisma.funcionario.findFirst({ where: { id, barbeiroId: req.barbeiro.id } });
    if (!funcionario) return notFound(res, 'Funcionário não encontrado.');

    // Serviços que apontavam para este funcionário voltam a ser "genéricos"
    // da barbearia (o onDelete: SetNull do schema cuida de agendamentos e
    // bloqueios automaticamente; serviços tratamos explicitamente aqui
    // porque a intenção de negócio — "some, continua vendável" — é a mesma
    // regra do SetNull, só deixando explícito).
    await prisma.$transaction([
      prisma.servico.updateMany({ where: { funcionarioId: id }, data: { funcionarioId: null } }),
      prisma.funcionario.delete({ where: { id } }),
    ]);

    return ok(res, null, 'Funcionário removido.');
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, criar, atualizar, remover };
