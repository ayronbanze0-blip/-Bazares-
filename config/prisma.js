/**
 * Client Prisma único e reaproveitado em toda a API.
 *
 * Em desenvolvimento (nodemon), o módulo é recarregado a cada mudança de
 * arquivo — sem esse cache em `global`, cada reload abriria uma conexão
 * nova com o banco. Guardando a instância em `global`, sobrevive aos
 * reloads e evita esgotar o pool de conexões.
 */
const { PrismaClient } = require('@prisma/client');

const global_ = globalThis;

const prisma =
  global_.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  global_.__prisma = prisma;
}

module.exports = prisma;
