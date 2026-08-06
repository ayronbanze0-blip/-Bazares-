/**
 * Helpers para padronizar as respostas da API
 */
function ok(res, data = null, message = 'Sucesso', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function created(res, data = null, message = 'Criado com sucesso') {
  return ok(res, data, message, 201);
}

function fail(res, message = 'Ocorreu um erro', status = 400, errors = null) {
  return res.status(status).json({ success: false, message, errors });
}

function notFound(res, message = 'Recurso não encontrado') {
  return fail(res, message, 404);
}

function unauthorized(res, message = 'Não autorizado') {
  return fail(res, message, 401);
}

module.exports = { ok, created, fail, notFound, unauthorized };
