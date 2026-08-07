const express = require('express');
const router = express.Router();
const controlador = require('../controllers/denuncias.controller');

router.post('/', controlador.criarDenuncia);

module.exports = router;
