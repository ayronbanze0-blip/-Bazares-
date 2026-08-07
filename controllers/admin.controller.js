const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { gerarTokenAdmin } = require('../utils/token');
const { ok, created, fail, notFound } = require('../utils/response');

function semSenha(admin) {
  const { senhaHash, ...resto } = admin;
  return resto;
}

/**
 * POST /api/admin/bootstrap — cria a PRIMEIRA conta de administrador.
 *
 * Existe para resolver um problema prático: em plataformas como o Render,
 * o plano gratuito não dá acesso a Shell nem facilidade para rodar um
 * script de seed pontual. Esta rota permite criar a conta de administrador
 * fazendo um único pedido HTTP (curl, Postman, ou até a barra de endereço
 * com um POST via alguma extensão) — sem tocar em variáveis de ambiente.
 *
 * Segurança: só funciona enquanto a tabela `administradores` estiver
 * vazia. Assim que a primeira conta é criada, esta rota passa a responder
 * sempre 403 — não há como "recriar" nem sobrepor um admin já existente
 * por aqui. Depois de usar, o login normal (POST /api/admin/login) é o
 * caminho a partir daí.
 */
async function bootstrap(req, res, next) {
  try {
    const totalExistente = await prisma.administrador.count();
    if (totalExistente > 0) {
      return fail(res, 'Já existe uma conta de administrador. Esta rota só funciona uma vez. Use /api/admin/login.', 403);
    }

    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return fail(res, 'Informe nome, e-mail e senha.', 422);
    if (senha.length < 6) return fail(res, 'A senha deve ter pelo menos 6 caracteres.', 422);

    const emailNormalizado = email.trim().toLowerCase();
    const senhaHash = await bcrypt.hash(senha, 10);

    const admin = await prisma.administrador.create({
      data: { nome, email: emailNormalizado, senhaHash },
    });

    const token = gerarTokenAdmin(admin.id);
    return created(res, { token, admin: semSenha(admin) }, 'Conta de administrador criada. Guarde a senha — esta rota agora está bloqueada.');
  } catch (err) {
    if (err.code === 'P2002') return fail(res, 'Este e-mail já está em uso.', 409);
    next(err);
  }
}

/** POST /api/admin/login */
async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return fail(res, 'Informe e-mail e senha.', 422);

    const admin = await prisma.administrador.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!admin) return fail(res, 'E-mail ou senha incorretos.', 401);

    const senhaConfere = await bcrypt.compare(senha, admin.senhaHash);
    if (!senhaConfere) return fail(res, 'E-mail ou senha incorretos.', 401);

    const token = gerarTokenAdmin(admin.id);
    return ok(res, { token, admin: semSenha(admin) }, 'Login realizado.');
  } catch (err) {
    next(err);
  }
}

async function obterPerfil(req, res) {
  return ok(res, req.admin, 'Perfil carregado.');
}

// ---------- Códigos de ativação de billing ----------

/** Gera um código legível tipo BF-8K3P-XQ2M (fácil de ditar/copiar por WhatsApp). */
function gerarCodigoLegivel() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 para evitar confusão
  let bloco = () => Array.from({ length: 4 }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join('');
  return `BF-${bloco()}-${bloco()}`;
}

/** POST /api/admin/codigos — gera um ou mais códigos de ativação */
async function gerarCodigos(req, res, next) {
  try {
    const { duracaoDias, quantidade, observacoes } = req.body;
    const dias = Number(duracaoDias);
    const qtd = Math.min(Math.max(Number(quantidade) || 1, 1), 100);

    if (!dias || dias <= 0) return fail(res, 'Informe a duração em dias que o código libera.', 422);

    const codigosGerados = [];
    for (let i = 0; i < qtd; i++) {
      let codigo;
      // Evita colisão (rara, mas o código é curto) tentando de novo se já existir.
      do {
        codigo = gerarCodigoLegivel();
      } while (await prisma.codigoAtivacao.findUnique({ where: { codigo } }));

      const criado = await prisma.codigoAtivacao.create({
        data: {
          codigo,
          duracaoDias: dias,
          observacoes: observacoes || '',
          criadoPorAdminId: req.admin.id,
        },
      });
      codigosGerados.push(criado);
    }

    return created(res, codigosGerados, `${qtd} código(s) gerado(s).`);
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/codigos?status=usado|disponivel */
async function listarCodigos(req, res, next) {
  try {
    const { status } = req.query;
    const where = {};
    if (status === 'usado') where.usado = true;
    if (status === 'disponivel') where.usado = false;

    const codigos = await prisma.codigoAtivacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: { usadoPor: { select: { nomeBarbearia: true, email: true, slug: true } } },
    });
    return ok(res, codigos, 'Códigos carregados.');
  } catch (err) {
    next(err);
  }
}

// ---------- Contas / billing ----------

/** GET /api/admin/barbearias — lista todas as contas com estado de billing */
async function listarBarbearias(req, res, next) {
  try {
    const barbearias = await prisma.barbeiro.findMany({
      select: {
        id: true, nome: true, nomeBarbearia: true, slug: true, email: true, telefone: true,
        assinaturaAtiva: true, assinaturaValidaAte: true, criadoEm: true,
      },
      orderBy: { criadoEm: 'desc' },
    });
    return ok(res, barbearias, 'Contas carregadas.');
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/visao-geral — totais para o topo do painel */
async function visaoGeral(req, res, next) {
  try {
    const agora = new Date();
    const [totalContas, contasAtivas, denunciasPendentes, codigosDisponiveis] = await Promise.all([
      prisma.barbeiro.count(),
      prisma.barbeiro.count({ where: { assinaturaAtiva: true, OR: [{ assinaturaValidaAte: null }, { assinaturaValidaAte: { gt: agora } }] } }),
      prisma.denuncia.count({ where: { status: 'pendente' } }),
      prisma.codigoAtivacao.count({ where: { usado: false } }),
    ]);
    return ok(res, { totalContas, contasAtivas, contasInativas: totalContas - contasAtivas, denunciasPendentes, codigosDisponiveis }, 'Visão geral carregada.');
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/barbearias/:id/confirmar-pagamento — ativa manualmente, sem código */
async function confirmarPagamento(req, res, next) {
  try {
    const { id } = req.params;
    const { dias } = req.body;
    const diasValidos = Number(dias) > 0 ? Number(dias) : 30;

    const barbeiro = await prisma.barbeiro.findUnique({ where: { id } });
    if (!barbeiro) return notFound(res, 'Conta não encontrada.');

    const baseData = barbeiro.assinaturaAtiva && barbeiro.assinaturaValidaAte > new Date()
      ? barbeiro.assinaturaValidaAte
      : new Date();
    const novaValidade = new Date(baseData);
    novaValidade.setDate(novaValidade.getDate() + diasValidos);

    const atualizado = await prisma.barbeiro.update({
      where: { id },
      data: { assinaturaAtiva: true, assinaturaValidaAte: novaValidade },
    });

    return ok(res, atualizado, 'Pagamento confirmado, conta ativada.');
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/barbearias/:id/suspender — desativa manualmente (ex.: chargeback, denúncia grave) */
async function suspenderConta(req, res, next) {
  try {
    const { id } = req.params;
    const atualizado = await prisma.barbeiro.update({
      where: { id },
      data: { assinaturaAtiva: false },
    });
    return ok(res, atualizado, 'Conta suspensa.');
  } catch (err) {
    if (err.code === 'P2025') return notFound(res, 'Conta não encontrada.');
    next(err);
  }
}

// ---------- Denúncias ----------

/** GET /api/admin/denuncias?status=pendente */
async function listarDenuncias(req, res, next) {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const denuncias = await prisma.denuncia.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: { barbeiro: { select: { nomeBarbearia: true, slug: true, email: true } } },
    });
    return ok(res, denuncias, 'Denúncias carregadas.');
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/denuncias/:id — muda status / adiciona nota do admin */
async function atualizarDenuncia(req, res, next) {
  try {
    const { id } = req.params;
    const { status, notaAdmin } = req.body;
    const statusValidos = ['pendente', 'em_analise', 'resolvida', 'arquivada'];

    const dados = {};
    if (status !== undefined) {
      if (!statusValidos.includes(status)) return fail(res, 'Status inválido.', 422);
      dados.status = status;
    }
    if (notaAdmin !== undefined) dados.notaAdmin = notaAdmin;

    const atualizada = await prisma.denuncia.update({ where: { id }, data: dados });
    return ok(res, atualizada, 'Denúncia atualizada.');
  } catch (err) {
    if (err.code === 'P2025') return notFound(res, 'Denúncia não encontrada.');
    next(err);
  }
}

module.exports = {
  login, obterPerfil, bootstrap,
  gerarCodigos, listarCodigos,
  listarBarbearias, confirmarPagamento, suspenderConta,
  listarDenuncias, atualizarDenuncia,
  visaoGeral,
};
