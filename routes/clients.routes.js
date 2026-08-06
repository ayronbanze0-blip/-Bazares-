const express = require('express');
const router = express.Router();
const controlador = require('../controllers/clients.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');

router.use(verificarAutenticacao);

router.get('/', controlador.listar);
router.get('/:telefone/historico', controlador.historico);

module.exports = router;
