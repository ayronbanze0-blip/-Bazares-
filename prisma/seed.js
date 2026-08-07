/**
 * Cria (ou corrige) a conta de administrador da plataforma.
 *
 * Existia até agora nenhuma rota de registro para `Administrador` — a única
 * forma de ter uma conta era inserir a linha manualmente no banco, o que
 * facilmente resulta numa senha guardada sem o hash bcrypt correto (ou num
 * e-mail com espaço/maiúsculas diferente do que o login normaliza). Nos
 * dois casos o login responde sempre "E-mail ou senha incorretos", mesmo
 * com a senha certa.
 *
 * Este script resolve isso de forma idempotente: se a conta já existir,
 * apenas actualiza nome e senha (hash correto); se não existir, cria.
 *
 * Uso:
 *   ADMIN_EMAIL=voce@exemplo.com ADMIN_SENHA=umaSenhaForte ADMIN_NOME="Seu Nome" node prisma/seed.js
 *
 * Se as variáveis não forem passadas, usa valores padrão de desenvolvimento
 * (troque-os antes de rodar em produção).
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

async function main() {
  const nome = process.env.ADMIN_NOME || 'Administrador BarberFlow';
  const emailBruto = process.env.ADMIN_EMAIL || 'admin@barberflow.local';
  const senha = process.env.ADMIN_SENHA || 'admin123456';

  const email = emailBruto.trim().toLowerCase();

  if (senha.length < 6) {
    console.error('❌ ADMIN_SENHA precisa ter pelo menos 6 caracteres.');
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const admin = await prisma.administrador.upsert({
    where: { email },
    update: { nome, senhaHash },
    create: { nome, email, senhaHash },
  });

  console.log('✅ Conta de administrador pronta:');
  console.log(`   nome:  ${admin.nome}`);
  console.log(`   email: ${admin.email}`);
  console.log(`   senha: ${senha}  (guarde num lugar seguro, isto não é salvo em texto simples no banco)`);
}

main()
  .catch((err) => {
    console.error('❌ Falha ao criar/actualizar o administrador:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
