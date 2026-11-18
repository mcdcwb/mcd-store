// Esvazia os carrinhos salvos no banco (tabela CartItem) de TODAS as contas.
// Não apaga contas, favoritos, endereços nem pedidos; o carrinho de visitante (localStorage do navegador) não é afetado.
//
// Uso (a partir de backend/, banco local):
//   ALLOW_CLEAR_CARTS=true DATABASE_URL=... npx tsx prisma/clear-carts.ts            apaga os itens de carrinho
//   ALLOW_CLEAR_CARTS=true DATABASE_URL=... npx tsx prisma/clear-carts.ts --count    só mostra as contagens
//
// - Só roda com ALLOW_CLEAR_CARTS=true (nunca é chamado pelo build/deploy).
// - O destino do banco segue as travas de src/lib/prisma.ts: local mcd_store_demo, ou o Neon
//   autorizado com NODE_ENV=production e MCD_DEMO_ALLOW_REMOTE_DATABASE=1.
// - Idempotente: rodar de novo com os carrinhos vazios não altera nada.
if (process.env.ALLOW_CLEAR_CARTS !== "true") {
  console.error("Execução recusada: defina ALLOW_CLEAR_CARTS=true para esvaziar os carrinhos.");
  process.exit(1);
}

const { prisma } = await import("../src/lib/prisma.js");

async function report(title: string) {
  const [cartItems, cartAccounts, users, favorites, adminFavorites, addresses] = await Promise.all([
    prisma.cartItem.count(),
    prisma.cartItem.groupBy({ by: ["userId"] }).then(rows => rows.length),
    prisma.user.count(),
    prisma.favorite.count(),
    prisma.adminFavorite.count(),
    prisma.userAddress.count(),
  ]);
  console.log(`\n${title}`);
  console.log(`  Itens de carrinho: ${cartItems} (em ${cartAccounts} conta(s))`);
  console.log(`  Preservados → contas: ${users} · favoritos: ${favorites} · favoritos de admin: ${adminFavorites} · endereços: ${addresses}`);
  return { cartItems, users, favorites, adminFavorites, addresses };
}

try {
  const [{ name: database }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  console.log(`Banco: ${database}`);
  const before = await report("Antes:");
  if (!process.argv.includes("--count")) {
    const removed = await prisma.cartItem.deleteMany({});
    console.log(`\nApagados ${removed.count} itens de carrinho.`);
    const after = await report("Depois:");
    const changed = (["users", "favorites", "adminFavorites", "addresses"] as const).filter(key => before[key] !== after[key]);
    // Só para sinalizar atividade simultânea (ex.: alguém se cadastrando): este script não toca nessas tabelas.
    if (changed.length) console.log(`  Aviso: ${changed.join(", ")} mudaram durante a execução (atividade de outros usuários).`);
  }
} finally {
  await prisma.$disconnect();
}
