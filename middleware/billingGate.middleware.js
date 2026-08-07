const { fail } = require('../utils/response');

/**
 * Bloqueia o acesso ao dashboard operacional quando a assinatura da
 * barbearia não está ativa (nunca ativada, ou o prazo já passou).
 * Precisa rodar DEPOIS de verificarAutenticacao (usa req.barbeiro).
 *
 * Rotas de auth/perfil e billing continuam livres — o barbeiro precisa
 * conseguir ver o próprio estado e resgatar um código mesmo sem assinatura
 * ativa, senão fica preso sem forma de pagar.
 */
function exigirAssinaturaAtiva(req, res, next) {
  const { assinaturaAtiva, assinaturaValidaAte } = req.barbeiro;

  const expirada = assinaturaValidaAte && new Date(assinaturaValidaAte) < new Date();

  if (!assinaturaAtiva || expirada) {
    return fail(res, 'Sua assinatura está inativa. Ative ou renove para continuar usando o painel.', 402);
  }

  next();
}

module.exports = { exigirAssinaturaAtiva };
