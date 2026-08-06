const express = require('express');
const router = express.Router();
const controlador = require('../controllers/auth.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');

router.post('/registrar', controlador.registrar);
router.post('/login', controlador.login);
router.get('/perfil', verificarAutenticacao, controlador.obterPerfil);
router.put('/perfil', verificarAutenticacao, controlador.atualizarPerfil);

module.exports = router;
