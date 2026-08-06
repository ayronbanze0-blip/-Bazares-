const { fail } = require('../utils/response');

function rotaNaoEncontrada(req, res) {
  return fail(res, `Rota não encontrada: ${req.method} ${req.originalUrl}`, 404);
}

// eslint-disable-next-line no-unused-vars
function tratadorDeErros(err, req, res, next) {
  console.error('[BarberFlow] Erro:', err);

  // Erros conhecidos do Prisma viram respostas amigáveis em vez de 500 genérico.
  if (err.code === 'P2002') return fail(res, 'Já existe um registro com esse valor único.', 409);
  if (err.code === 'P2025') return fail(res, 'Registro não encontrado.', 404);

  const status = err.status || 500;
  return fail(res, err.message || 'Erro interno do servidor.', status);
}

module.exports = { rotaNaoEncontrada, tratadorDeErros };
