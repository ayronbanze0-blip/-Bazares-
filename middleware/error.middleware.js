const { fail } = require('../utils/response');

function rotaNaoEncontrada(req, res) {
  return fail(res, `Rota não encontrada: ${req.method} ${req.originalUrl}`, 404);
}

// eslint-disable-next-line no-unused-vars
function tratadorDeErros(err, req, res, next) {
  console.error('[BarberFlow] Erro:', err);
  const status = err.status || 500;
  return fail(res, err.message || 'Erro interno do servidor.', status);
}

module.exports = { rotaNaoEncontrada, tratadorDeErros };
