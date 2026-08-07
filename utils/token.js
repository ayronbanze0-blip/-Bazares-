const jwt = require('jsonwebtoken');
require('dotenv').config();

const SEGREDO = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const VALIDADE = '30d';

function gerarToken(barbeiroId) {
  return jwt.sign({ uid: barbeiroId }, SEGREDO, { expiresIn: VALIDADE });
}

function gerarTokenAdmin(adminId) {
  return jwt.sign({ uid: adminId, papel: 'admin' }, SEGREDO, { expiresIn: VALIDADE });
}

function verificarToken(token) {
  return jwt.verify(token, SEGREDO); // lança erro se inválido/expirado
}

module.exports = { gerarToken, gerarTokenAdmin, verificarToken };
