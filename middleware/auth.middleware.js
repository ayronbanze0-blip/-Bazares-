const { verificarToken } = require('../utils/token');
const prisma = require('../config/prisma');
const { unauthorized } = require('../utils/response');

/**
 * Verifica o token JWT enviado no header Authorization: Bearer <token>.
 * Anexa req.barbeiro = { id, email, ...dadosDoBarbeiro } (sem a senha).
 */
async function verificarAutenticacao(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return unauthorized(res, 'Token de autenticação ausente.');

    const payload = verificarToken(token);
    if (payload.papel === 'admin') return unauthorized(res, 'Este token é de administrador, não de barbearia.');
    const barbeiro = await prisma.barbeiro.findUnique({ where: { id: payload.uid } });
    if (!barbeiro) return unauthorized(res, 'Conta não encontrada.');

    const { senhaHash, ...barbeiroSemSenha } = barbeiro;
    req.barbeiro = barbeiroSemSenha;
    next();
  } catch (err) {
    return unauthorized(res, 'Token inválido ou expirado.');
  }
}

module.exports = { verificarAutenticacao };
