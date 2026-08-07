const express = require('express');
const router = express.Router();
const controlador = require('../controllers/appointments.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');
const { exigirAssinaturaAtiva } = require('../middleware/billingGate.middleware');

router.use(verificarAutenticacao);
router.use(exigirAssinaturaAtiva);

router.get('/', controlador.listar);
router.post('/', controlador.criarManual);
router.patch('/:id/status', controlador.atualizarStatus);
router.patch('/:id/reagendar', controlador.reagendar);
router.delete('/:id', controlador.remover);

module.exports = router;
