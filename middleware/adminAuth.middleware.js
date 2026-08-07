const { verificarToken } = require('../utils/token');
const prisma = require('../config/prisma');
const { unauthorized } = require('../utils/response');

/**
 * Verifica o token JWT de um administrador da plataforma (papel: 'admin').
 * Um token de barbeiro comum não passa aqui, e vice-versa — são contas e
 * tabelas completamente separadas.
 * Anexa req.admin = { id, nome, email }.
 */
async function verificarAutenticacaoAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return unauthorized(res, 'Token de autenticação ausente.');

    const payload = verificarToken(token);
    if (payload.papel !== 'admin') return unauthorized(res, 'Esta conta não tem acesso de administrador.');

    const admin = await prisma.administrador.findUnique({ where: { id: payload.uid } });
    if (!admin) return unauthorized(res, 'Conta de administrador não encontrada.');

    const { senhaHash, ...adminSemSenha } = admin;
    req.admin = adminSemSenha;
    next();
  } catch (err) {
    return unauthorized(res, 'Token inválido ou expirado.');
  }
}

module.exports = { verificarAutenticacaoAdmin };
