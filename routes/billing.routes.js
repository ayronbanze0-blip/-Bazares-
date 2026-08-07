const express = require('express');
const router = express.Router();
const controlador = require('../controllers/billing.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');

router.use(verificarAutenticacao);

router.get('/estado', controlador.obterEstado);
router.post('/resgatar', controlador.resgatarCodigo);

module.exports = router;
