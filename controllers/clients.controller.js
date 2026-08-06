const prisma = require('../config/prisma');
const { ok, notFound } = require('../utils/response');

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Cria ou atualiza o registro do cliente automaticamente a partir de um agendamento.
 * Um cliente é identificado pelo par (barbeiro + telefone normalizado).
 * Recebe opcionalmente um `tx` (transação Prisma em andamento) para ficar
 * atômico junto com a criação do agendamento.
 */
async function registrarOuAtualizarCliente(barbeiroId, { nome, telefone, email }, tx = prisma) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  if (!telefoneNormalizado) return null;

  const agora = new Date();

  return tx.cliente.upsert({
    where: { barbeiroId_telefone: { barbeiroId, telefone: telefoneNormalizado } },
    update: {
      nome,
      telefoneExibicao: telefone,
      email: email || undefined,
      totalAgendamentos: { increment: 1 },
      ultimoAgendamento: agora,
    },
    create: {
      barbeiroId,
      telefone: telefoneNormalizado,
      telefoneExibicao: telefone,
      nome,
      email: email || '',
      totalAgendamentos: 1,
      totalGasto: 0,
      primeiroAgendamento: agora,
      ultimoAgendamento: agora,
    },
  });
}

async function listar(req, res, next) {
  try {
    const { busca } = req.query;

    let clientes = await prisma.cliente.findMany({
      where: { barbeiroId: req.barbeiro.id },
      orderBy: { ultimoAgendamento: 'desc' },
    });

    if (busca) {
      const termo = busca.toLowerCase();
      clientes = clientes.filter(
        (c) =>
          c.nome?.toLowerCase().includes(termo) ||
          c.telefoneExibicao?.includes(termo) ||
          c.email?.toLowerCase().includes(termo)
      );
    }

    // Compatibilidade com o front-end (que espera "telefone" com máscara original)
    clientes = clientes.map((c) => ({ ...c, telefone: c.telefoneExibicao || c.telefone }));

    return ok(res, clientes, 'Clientes carregados.');
  } catch (err) {
    next(err);
  }
}

async function historico(req, res, next) {
  try {
    const telefoneNormalizado = normalizarTelefone(req.params.telefone);

    const cliente = await prisma.cliente.findUnique({
      where: { barbeiroId_telefone: { barbeiroId: req.barbeiro.id, telefone: telefoneNormalizado } },
    });
    if (!cliente) return notFound(res, 'Cliente não encontrado.');

    const agendamentos = await prisma.agendamento.findMany({
      where: { barbeiroId: req.barbeiro.id, clienteTelefoneNormalizado: telefoneNormalizado },
      orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
    });

    return ok(res, { cliente: { ...cliente, telefone: cliente.telefoneExibicao || cliente.telefone }, agendamentos });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, historico, registrarOuAtualizarCliente, normalizarTelefone };
