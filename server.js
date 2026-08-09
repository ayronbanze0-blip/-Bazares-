require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const prisma = require('./config/prisma');
const { rotaNaoEncontrada, tratadorDeErros } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const servicesRoutes = require('./routes/services.routes');
const funcionariosRoutes = require('./routes/funcionarios.routes');
const appointmentsRoutes = require('./routes/appointments.routes');
const availabilityRoutes = require('./routes/availability.routes');
const clientsRoutes = require('./routes/clients.routes');
const reportsRoutes = require('./routes/reports.routes');
const publicRoutes = require('./routes/public.routes');
const adminRoutes = require('./routes/admin.routes');
const billingRoutes = require('./routes/billing.routes');
const denunciasRoutes = require('./routes/denuncias.routes');
const { listarBarbearias } = require('./controllers/public.controller');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Limita tentativas de agendamento/registro público para evitar abuso
const limitadorPublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Muitas requisições. Tente novamente em instantes.' },
});
app.use('/api/public', limitadorPublico);
app.use('/api/barbearias', limitadorPublico);
app.use('/api/denuncias', limitadorPublico);
app.use('/api/admin/login', limitadorPublico);
app.use('/api/admin/bootstrap', limitadorPublico);

// Login/registro de barbearia: mais apertado que o limite público geral,
// para dificultar brute-force de senha sem incomodar uso normal.
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});
app.use('/api/auth/login', limitadorAuth);
app.use('/api/auth/registrar', limitadorAuth);

app.get('/api/saude', (req, res) => res.json({ success: true, servico: 'BarberFlow API', status: 'online' }));

app.get('/api/barbearias', listarBarbearias);
app.use('/api/auth', authRoutes);
app.use('/api/servicos', servicesRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/agendamentos', appointmentsRoutes);
app.use('/api/disponibilidade', availabilityRoutes);
app.use('/api/clientes', clientsRoutes);
app.use('/api/relatorios', reportsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/denuncias', denunciasRoutes);

app.use(rotaNaoEncontrada);
app.use(tratadorDeErros);

/**
 * Garante que existe pelo menos uma conta de administrador ao iniciar o
 * servidor. Criado para plataformas como o Render (plano gratuito), onde
 * não há Shell nem forma fácil de rodar um script pontual — assim a conta
 * é criada sozinha no primeiro deploy, direto no arranque do processo.
 *
 * É seguro rodar isto em todo restart/deploy: só cria a conta se a tabela
 * `administradores` estiver vazia. Depois da primeira vez, esta função só
 * confirma que já existe e não faz mais nada.
 *
 * IMPORTANTE: as credenciais abaixo estão fixas no código só para permitir
 * este primeiro acesso. Depois de conseguires entrar no painel, troque a
 * senha (ou pelo menos remova este bloco) para não ficar com uma senha
 * previsível no repositório.
 */
async function garantirAdminInicial() {
  try {
    const totalExistente = await prisma.administrador.count();
    if (totalExistente > 0) return;

    const nome = 'Admin';
    const email = 'admin@gmail.com';
    const senha = '4evermine';
    const senhaHash = await bcrypt.hash(senha, 10);

    await prisma.administrador.create({ data: { nome, email, senhaHash } });
    console.log(`✅ Conta de administrador inicial criada (email: ${email}). Troque a senha após o primeiro login.`);
  } catch (err) {
    console.error('⚠️  Não foi possível garantir a conta de administrador inicial:', err.message);
  }
}

const PORTA = process.env.PORT || 4000;
const servidor = app.listen(PORTA, () => {
  console.log(`✂️  BarberFlow API rodando em http://localhost:${PORTA}`);
  garantirAdminInicial();
});

// Encerra a conexão com o banco de forma limpa ao desligar o processo
// (ex.: deploy, restart do container, Ctrl+C em dev).
async function encerrarComCalma(sinal) {
  console.log(`\n${sinal} recebido, encerrando...`);
  servidor.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => encerrarComCalma('SIGINT'));
process.on('SIGTERM', () => encerrarComCalma('SIGTERM'));

module.exports = app;
