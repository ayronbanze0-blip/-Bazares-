const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { gerarToken } = require('../utils/token');
const { ok, created, fail } = require('../utils/response');

const EXPEDIENTE_PADRAO = {
  segunda: { abre: '09:00', fecha: '19:00', fechado: false, pausas: [] },
  terca: { abre: '09:00', fecha: '19:00', fechado: false, pausas: [] },
  quarta: { abre: '09:00', fecha: '19:00', fechado: false, pausas: [] },
  quinta: { abre: '09:00', fecha: '19:00', fechado: false, pausas: [] },
  sexta: { abre: '09:00', fecha: '19:00', fechado: false, pausas: [] },
  sabado: { abre: '09:00', fecha: '17:00', fechado: false, pausas: [] },
  domingo: { abre: '09:00', fecha: '13:00', fechado: true, pausas: [] },
};

function gerarSlug(nomeBarbearia) {
  return nomeBarbearia
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function semSenha(barbeiro) {
  const { senhaHash, ...resto } = barbeiro;
  return resto;
}

/**
 * Gera um slug único tentando "nome", "nome-1", "nome-2"... Roda dentro de
 * uma transação com o insert para não haver corrida entre dois registros
 * simultâneos com o mesmo nome de barbearia.
 */
async function gerarSlugUnico(tx, nomeBarbearia) {
  const slugBase = gerarSlug(nomeBarbearia) || 'barbearia';
  let slug = slugBase;
  let tentativa = 1;
  while (await tx.barbeiro.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${tentativa++}`;
  }
  return slug;
}

async function registrar(req, res, next) {
  try {
    const { nome, nomeBarbearia, email, senha, telefone } = req.body;

    if (!nome || !nomeBarbearia || !email || !senha) {
      return fail(res, 'Preencha nome, nome da barbearia, e-mail e senha.', 422);
    }
    if (senha.length < 6) {
      return fail(res, 'A senha deve ter pelo menos 6 caracteres.', 422);
    }

    const emailNormalizado = email.trim().toLowerCase();
    const existente = await prisma.barbeiro.findUnique({ where: { email: emailNormalizado } });
    if (existente) return fail(res, 'Este e-mail já está em uso.', 409);

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoBarbeiro = await prisma.$transaction(async (tx) => {
      const slug = await gerarSlugUnico(tx, nomeBarbearia);
      return tx.barbeiro.create({
        data: {
          nome,
          nomeBarbearia,
          slug,
          email: emailNormalizado,
          senhaHash,
          telefone: telefone || '',
          expediente: EXPEDIENTE_PADRAO,
          config: { intervaloEntreSlots: 15, antecedenciaMinimaMinutos: 60 },
        },
      });
    });

    const token = gerarToken(novoBarbeiro.id);
    return created(res, { token, barbeiro: semSenha(novoBarbeiro) }, 'Conta criada com sucesso.');
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return fail(res, 'Informe e-mail e senha.', 422);

    const barbeiro = await prisma.barbeiro.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!barbeiro) return fail(res, 'E-mail ou senha incorretos.', 401);

    const senhaConfere = await bcrypt.compare(senha, barbeiro.senhaHash);
    if (!senhaConfere) return fail(res, 'E-mail ou senha incorretos.', 401);

    const token = gerarToken(barbeiro.id);
    return ok(res, { token, barbeiro: semSenha(barbeiro) }, 'Login realizado.');
  } catch (err) {
    next(err);
  }
}

async function obterPerfil(req, res) {
  return ok(res, req.barbeiro, 'Perfil carregado.');
}

async function atualizarPerfil(req, res, next) {
  try {
    const camposPermitidos = [
      'nome', 'nomeBarbearia', 'telefone', 'endereco', 'logoUrl',
      'corTema', 'tema', 'expediente', 'config',
    ];

    const dadosAtualizados = {};
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) dadosAtualizados[campo] = req.body[campo];
    }

    const barbeiro = await prisma.barbeiro.update({
      where: { id: req.barbeiro.id },
      data: dadosAtualizados,
    });

    return ok(res, semSenha(barbeiro), 'Perfil atualizado.');
  } catch (err) {
    if (err.code === 'P2025') return fail(res, 'Conta não encontrada.', 404);
    next(err);
  }
}

module.exports = { registrar, login, obterPerfil, atualizarPerfil, EXPEDIENTE_PADRAO };
