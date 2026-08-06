const db = require('../config/db');
const { gerarId } = require('../utils/id');
const { ok, created, notFound, fail } = require('../utils/response');

async function listar(req, res, next) {
  try {
    const dados = db.ler();
    const servicos = dados.servicos
      .filter((s) => s.barbeiroId === req.barbeiro.id)
      .sort((a, b) => a.ordem - b.ordem);
    return ok(res, servicos, 'Serviços carregados.');
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    const { nome, descricao, preco, duracaoMinutos } = req.body;
    if (!nome || preco == null || !duracaoMinutos) {
      return fail(res, 'Informe nome, preço e duração do serviço.', 422);
    }

    const dados = db.ler();
    const totalAtual = dados.servicos.filter((s) => s.barbeiroId === req.barbeiro.id).length;

    const novo = {
      id: gerarId(),
      barbeiroId: req.barbeiro.id,
      nome,
      descricao: descricao || '',
      preco: Number(preco),
      duracaoMinutos: Number(duracaoMinutos),
      ativo: true,
      ordem: totalAtual,
      criadoEm: new Date().toISOString(),
    };

    dados.servicos.push(novo);
    await db.escrever(dados);
    return created(res, novo, 'Serviço criado.');
  } catch (err) {
    next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    const { id } = req.params;
    const dados = db.ler();
    const servico = dados.servicos.find((s) => s.id === id && s.barbeiroId === req.barbeiro.id);
    if (!servico) return notFound(res, 'Serviço não encontrado.');

    const camposPermitidos = ['nome', 'descricao', 'preco', 'duracaoMinutos', 'ativo', 'ordem'];
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) servico[campo] = req.body[campo];
    }
    servico.atualizadoEm = new Date().toISOString();

    await db.escrever(dados);
    return ok(res, servico, 'Serviço atualizado.');
  } catch (err) {
    next(err);
  }
}

async function remover(req, res, next) {
  try {
    const { id } = req.params;
    const dados = db.ler();
    const indice = dados.servicos.findIndex((s) => s.id === id && s.barbeiroId === req.barbeiro.id);
    if (indice === -1) return notFound(res, 'Serviço não encontrado.');

    dados.servicos.splice(indice, 1);
    await db.escrever(dados);
    return ok(res, null, 'Serviço removido.');
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, criar, atualizar, remover };
