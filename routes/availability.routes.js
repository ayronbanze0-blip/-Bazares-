const express = require('express');
const router = express.Router();
const controlador = require('../controllers/availability.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');
const { exigirAssinaturaAtiva } = require('../middleware/billingGate.middleware');

router.use(verificarAutenticacao);
router.use(exigirAssinaturaAtiva);

router.get('/expediente', controlador.obterExpediente);
router.put('/expediente', controlador.atualizarExpediente);

router.get('/bloqueios', controlador.listarBloqueios);
router.post('/bloqueios', controlador.criarBloqueio);
router.delete('/bloqueios/:id', controlador.removerBloqueio);

module.exports = router;
