const prisma = require('../config/prisma');
const { ok, fail, notFound } = require('../utils/response');

/** GET /api/billing/estado — a própria barbearia consulta o estado da assinatura */
async function obterEstado(req, res) {
  const { assinaturaAtiva, assinaturaValidaAte } = req.barbeiro;
  return ok(res, { assinaturaAtiva, assinaturaValidaAte }, 'Estado da assinatura carregado.');
}

/** POST /api/billing/resgatar — a barbearia insere o código recebido do admin */
async function resgatarCodigo(req, res, next) {
  try {
    const { codigo } = req.body;
    if (!codigo) return fail(res, 'Informe o código.', 422);

    const codigoNormalizado = codigo.trim().toUpperCase();
    const registro = await prisma.codigoAtivacao.findUnique({ where: { codigo: codigoNormalizado } });

    if (!registro) return notFound(res, 'Código não encontrado.');
    if (registro.usado) return fail(res, 'Este código já foi utilizado.', 409);

    const baseData = req.barbeiro.assinaturaAtiva && req.barbeiro.assinaturaValidaAte > new Date()
      ? req.barbeiro.assinaturaValidaAte
      : new Date();
    const novaValidade = new Date(baseData);
    novaValidade.setDate(novaValidade.getDate() + registro.duracaoDias);

    const [, barbeiroAtualizado] = await prisma.$transaction([
      prisma.codigoAtivacao.update({
        where: { id: registro.id },
        data: { usado: true, usadoEm: new Date(), usadoPorId: req.barbeiro.id },
      }),
      prisma.barbeiro.update({
        where: { id: req.barbeiro.id },
        data: { assinaturaAtiva: true, assinaturaValidaAte: novaValidade },
      }),
    ]);

    return ok(res, {
      assinaturaAtiva: barbeiroAtualizado.assinaturaAtiva,
      assinaturaValidaAte: barbeiroAtualizado.assinaturaValidaAte,
    }, `Código aplicado! Assinatura válida até ${novaValidade.toLocaleDateString('pt-BR')}.`);
  } catch (err) {
    next(err);
  }
}

module.exports = { obterEstado, resgatarCodigo };
