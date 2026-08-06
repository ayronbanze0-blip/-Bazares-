const express = require('express');
const router = express.Router();
const controlador = require('../controllers/reports.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');

router.use(verificarAutenticacao);

router.get('/resumo', controlador.resumo);

module.exports = router;
