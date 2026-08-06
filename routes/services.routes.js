const express = require('express');
const router = express.Router();
const controlador = require('../controllers/services.controller');
const { verificarAutenticacao } = require('../middleware/auth.middleware');

router.use(verificarAutenticacao);

router.get('/', controlador.listar);
router.post('/', controlador.criar);
router.put('/:id', controlador.atualizar);
router.delete('/:id', controlador.remover);

module.exports = router;
