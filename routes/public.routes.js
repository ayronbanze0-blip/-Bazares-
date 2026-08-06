const express = require('express');
const router = express.Router();
const controlador = require('../controllers/public.controller');

router.get('/:slug', controlador.obterBarbearia);
router.get('/:slug/horarios', controlador.obterHorariosDisponiveis);
router.post('/:slug/agendar', controlador.criarAgendamentoPublico);

module.exports = router;
