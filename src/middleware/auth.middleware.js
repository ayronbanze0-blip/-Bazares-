const { verificarToken } = require('../utils/token');
const db = require('../config/db');
const { unauthorized } = require('../utils/response');

/**
 * Verifica o token JWT enviado no header Authorization: Bearer <token>.
 * Anexa req.barbeiro = { id, email, ...dadosDoBarbeiro } (sem a senha).
 */
function verificarAutenticacao(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return unauthorized(res, 'Token de autenticação ausente.');

    const payload = verificarToken(token);
    const dados = db.ler();
    const barbeiro = dados.barbeiros.find((b) => b.id === payload.uid);
    if (!barbeiro) return unauthorized(res, 'Conta não encontrada.');

    const { senhaHash, ...barbeiroSemSenha } = barbeiro;
    req.barbeiro = barbeiroSemSenha;
    next();
  } catch (err) {
    return unauthorized(res, 'Token inválido ou expirado.');
  }
}

module.exports = { verificarAutenticacao };
