const express = require('express');
const router = express.Router();
const controlador = require('../controllers/clients.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');
const { exigirAssinaturaAtiva } = require('../middleware/billingGate.middleware');

router.use(verificarAutenticacao);
router.use(exigirAssinaturaAtiva);

router.get('/', controlador.listar);
router.get('/:telefone/historico', controlador.historico);

module.exports = router;
