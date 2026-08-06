const prisma = require('../config/prisma');
const { ok, fail } = require('../utils/response');

async function resumo(req, res, next) {
  try {
    const { de, ate } = req.query;
    if (!de || !ate) return fail(res, 'Informe o período (de/ate).', 422);

    const agendamentos = await prisma.agendamento.findMany({
      where: { barbeiroId: req.barbeiro.id, data: { gte: de, lte: ate } },
    });

    const concluidos = agendamentos.filter((a) => a.status === 'concluido');
    const cancelados = agendamentos.filter((a) => a.status === 'cancelado');
    const confirmados = agendamentos.filter((a) => a.status === 'confirmado');
    const pendentes = agendamentos.filter((a) => a.status === 'pendente');

    const faturamento = concluidos.reduce((soma, a) => soma + (a.preco || 0), 0);
    const ticketMedio = concluidos.length ? faturamento / concluidos.length : 0;

    const porServico = {};
    concluidos.forEach((a) => {
      const chave = a.servicoNome || 'Outro';
      if (!porServico[chave]) porServico[chave] = { nome: chave, quantidade: 0, faturamento: 0 };
      porServico[chave].quantidade += 1;
      porServico[chave].faturamento += a.preco || 0;
    });

    const porDia = {};
    agendamentos.forEach((a) => {
      if (!porDia[a.data]) porDia[a.data] = { data: a.data, quantidade: 0, faturamento: 0 };
      porDia[a.data].quantidade += 1;
      if (a.status === 'concluido') porDia[a.data].faturamento += a.preco || 0;
    });

    return ok(res, {
      totalAgendamentos: agendamentos.length,
      concluidos: concluidos.length,
      cancelados: cancelados.length,
      confirmados: confirmados.length,
      pendentes: pendentes.length,
      faturamento,
      ticketMedio,
      taxaCancelamento: agendamentos.length ? cancelados.length / agendamentos.length : 0,
      porServico: Object.values(porServico).sort((a, b) => b.faturamento - a.faturamento),
      porDia: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
    }, 'Relatório gerado.');
  } catch (err) {
    next(err);
  }
}

module.exports = { resumo };
