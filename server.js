require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

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

app.get('/api/saude', (req, res) => res.json({ success: true, servico: 'BarberFlow API', status: 'online' }));

app.use('/api/auth', authRoutes);
app.use('/api/servicos', servicesRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/agendamentos', appointmentsRoutes);
app.use('/api/disponibilidade', availabilityRoutes);
app.use('/api/clientes', clientsRoutes);
app.use('/api/relatorios', reportsRoutes);
app.use('/api/public', publicRoutes);

app.use(rotaNaoEncontrada);
app.use(tratadorDeErros);

const PORTA = process.env.PORT || 4000;
const servidor = app.listen(PORTA, () => {
  console.log(`✂️  BarberFlow API rodando em http://localhost:${PORTA}`);
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
