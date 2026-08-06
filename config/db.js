/**
 * "Banco de dados" simples em arquivo JSON.
 *
 * Sem serviços externos, sem contas para configurar: os dados ficam em
 * backend/data/db.json. Suficiente para uma barbearia (ou algumas dezenas)
 * rodando em produção pequena/média. Se um dia crescer muito, é só trocar
 * este arquivo por uma conexão real de banco — o resto do código não muda,
 * porque todo mundo acessa os dados só através das funções daqui.
 */
const fs = require('fs');
const path = require('path');

const CAMINHO_DB = path.join(__dirname, '..', 'data', 'db.json');

const ESTRUTURA_INICIAL = {
  barbeiros: [],
  servicos: [],
  agendamentos: [],
  clientes: [],
  bloqueios: [],
};

function garantirArquivo() {
  if (!fs.existsSync(CAMINHO_DB)) {
    fs.mkdirSync(path.dirname(CAMINHO_DB), { recursive: true });
    fs.writeFileSync(CAMINHO_DB, JSON.stringify(ESTRUTURA_INICIAL, null, 2));
  }
}

// Fila simples para serializar escritas e evitar corrida entre requisições concorrentes
let filaEscrita = Promise.resolve();

function ler() {
  garantirArquivo();
  const conteudo = fs.readFileSync(CAMINHO_DB, 'utf-8');
  try {
    return JSON.parse(conteudo);
  } catch {
    return structuredClone(ESTRUTURA_INICIAL);
  }
}

function escrever(dados) {
  filaEscrita = filaEscrita.then(
    () => fs.promises.writeFile(CAMINHO_DB, JSON.stringify(dados, null, 2))
  );
  return filaEscrita;
}

/**
 * Executa uma operação de leitura + escrita de forma atômica em relação
 * às outras chamadas de `transacao`, evitando condição de corrida
 * (ex.: dois clientes agendando o mesmo horário ao mesmo tempo).
 */
function transacao(funcao) {
  filaEscrita = filaEscrita.then(async () => {
    const dados = ler();
    const resultado = await funcao(dados);
    await fs.promises.writeFile(CAMINHO_DB, JSON.stringify(dados, null, 2));
    return resultado;
  });
  return filaEscrita;
}

module.exports = { ler, escrever, transacao };
