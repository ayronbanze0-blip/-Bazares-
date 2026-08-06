const { randomUUID } = require('crypto');

function gerarId() {
  return randomUUID();
}

module.exports = { gerarId };
