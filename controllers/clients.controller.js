const db = require('../config/db');
const { gerarId } = require('../utils/id');
const { ok, notFound } = require('../utils/response');

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Cria ou atualiza o registro do cliente automaticamente a partir de um agendamento.
 * Um cliente é identificado pelo par (barbeiro + telefone normalizado).
 */
async function registrarOuAtualizarCliente(barbeiroId, { nome, telefone, email }) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  if (!telefoneNormalizado) return null;

  return db.transacao((dados) => {
    let cliente = dados.clientes.find(
      (c) => c.barbeiroId === barbeiroId && c.telefone === telefoneNormalizado
    );

    if (!cliente) {
      cliente = {
        id: gerarId(),
        barbeiroId,
        telefone: telefoneNormalizado,
        telefoneExibicao: telefone,
        nome,
        email: email || '',
        totalAgendamentos: 1,
        totalGasto: 0,
        primeiroAgendamento: new Date().toISOString(),
        ultimoAgendamento: new Date().toISOString(),
      };
      dados.clientes.push(cliente);
    } else {
      cliente.nome = nome;
      cliente.telefoneExibicao = telefone;
      cliente.email = email || cliente.email || '';
      cliente.totalAgendamentos += 1;
      cliente.ultimoAgendamento = new Date().toISOString();
    }

    return cliente;
  });
}

async function listar(req, res, next) {
  try {
    const { busca } = req.query;
    const dados = db.ler();
    let clientes = dados.clientes
      .filter((c) => c.barbeiroId === req.barbeiro.id)
      .sort((a, b) => new Date(b.ultimoAgendamento) - new Date(a.ultimoAgendamento));

    if (busca) {
      const termo = busca.toLowerCase();
      clientes = clientes.filter(
        (c) =>
          c.nome?.toLowerCase().includes(termo) ||
          c.telefoneExibicao?.includes(termo) ||
          c.email?.toLowerCase().includes(termo)
      );
    }

    // Compatibilidade com o front-end (que espera "telefone" com máscara original)
    clientes = clientes.map((c) => ({ ...c, telefone: c.telefoneExibicao || c.telefone }));

    return ok(res, clientes, 'Clientes carregados.');
  } catch (err) {
    next(err);
  }
}

async function historico(req, res, next) {
  try {
    const telefoneNormalizado = normalizarTelefone(req.params.telefone);
    const dados = db.ler();

    const cliente = dados.clientes.find(
      (c) => c.barbeiroId === req.barbeiro.id && c.telefone === telefoneNormalizado
    );
    if (!cliente) return notFound(res, 'Cliente não encontrado.');

    const agendamentos = dados.agendamentos
      .filter((a) => a.barbeiroId === req.barbeiro.id && a.clienteTelefoneNormalizado === telefoneNormalizado)
      .sort((a, b) => (b.data + b.horaInicio).localeCompare(a.data + a.horaInicio));

    return ok(res, { cliente: { ...cliente, telefone: cliente.telefoneExibicao || cliente.telefone }, agendamentos });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, historico, registrarOuAtualizarCliente, normalizarTelefone };
