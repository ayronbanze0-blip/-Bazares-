const prisma = require('../config/prisma');
const { created, fail, notFound } = require('../utils/response');

/** POST /api/denuncias — qualquer pessoa pode denunciar uma barbearia (ou o app em geral) */
async function criarDenuncia(req, res, next) {
  try {
    const { barbeariaSlug, nomeDenunciante, contactoDenunciante, motivo, mensagem } = req.body;

    if (!motivo || !mensagem) {
      return fail(res, 'Descreva o motivo e a denúncia.', 422);
    }

    let barbeiroId = null;
    if (barbeariaSlug) {
      const barbeiro = await prisma.barbeiro.findUnique({ where: { slug: barbeariaSlug } });
      if (!barbeiro) return notFound(res, 'Barbearia não encontrada.');
      barbeiroId = barbeiro.id;
    }

    const denuncia = await prisma.denuncia.create({
      data: {
        barbeiroId,
        nomeDenunciante: nomeDenunciante || '',
        contactoDenunciante: contactoDenunciante || '',
        motivo,
        mensagem,
      },
    });

    return created(res, { id: denuncia.id }, 'Denúncia enviada. Obrigado por ajudar a manter a plataforma segura.');
  } catch (err) {
    next(err);
  }
}

module.exports = { criarDenuncia };
