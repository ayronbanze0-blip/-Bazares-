const express = require('express');
const router = express.Router();
const controlador = require('../controllers/admin.controller');
const { verificarAutenticacaoAdmin } = require('../middleware/adminAuth.middleware');

router.post('/login', controlador.login);

router.use(verificarAutenticacaoAdmin);

router.get('/perfil', controlador.obterPerfil);
router.get('/visao-geral', controlador.visaoGeral);

router.post('/codigos', controlador.gerarCodigos);
router.get('/codigos', controlador.listarCodigos);

router.get('/barbearias', controlador.listarBarbearias);
router.post('/barbearias/:id/confirmar-pagamento', controlador.confirmarPagamento);
router.post('/barbearias/:id/suspender', controlador.suspenderConta);

router.get('/denuncias', controlador.listarDenuncias);
router.patch('/denuncias/:id', controlador.atualizarDenuncia);

module.exports = router;
