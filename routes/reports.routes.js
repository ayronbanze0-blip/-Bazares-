const express = require('express');
const router = express.Router();
const controlador = require('../controllers/reports.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');
const { exigirAssinaturaAtiva } = require('../middleware/billingGate.middleware');

router.use(verificarAutenticacao);
router.use(exigirAssinaturaAtiva);

router.get('/resumo', controlador.resumo);

module.exports = router;
