// Seed de vendas FICTÍCIAS para o Dashboard, a lista de Pedidos e os Relatórios da demonstração MCD Store:
// 30 pedidos nos últimos 4 meses, com os mais recentes em andamento e os mais antigos finalizados/cancelados.
//
// Uso (a partir de backend/, banco local):
//   ALLOW_DEMO_SEED=true DATABASE_URL=... npx tsx prisma/seed-demo-orders.ts            recria os 30 pedidos
//   ALLOW_DEMO_SEED=true DATABASE_URL=... npx tsx prisma/seed-demo-orders.ts --count    só mostra as contagens
//   ALLOW_DEMO_SEED=true DATABASE_URL=... npx tsx prisma/seed-demo-orders.ts --remove   só apaga os fictícios
//
// - Só roda com ALLOW_DEMO_SEED=true (nunca é chamado pelo build/deploy).
// - O destino do banco segue as travas de src/lib/prisma.ts: local mcd_store_demo, ou o Neon
//   autorizado com NODE_ENV=production e MCD_DEMO_ALLOW_REMOTE_DATABASE=1.
// - Apaga SOMENTE pedidos com isDemo = true (itens e eventos saem junto) e os clientes fictícios sem pedidos.
//   Pedidos reais nunca são apagados: são listados com um aviso antes de qualquer alteração.
// - Idempotente: apaga os fictícios e recria na mesma transação. Rodar duas vezes não duplica, e os números
//   dos pedidos fictícios se repetem (continuam a partir do maior número de pedido real).
// - Determinístico: gerador aleatório com seed fixa (datas relativas ao momento da execução).
// - NÃO altera o estoque: os pedidos referenciam as variantes reais, mas nenhuma quantidade é baixada.
import { randomBytes } from "node:crypto";
import type { Prisma as PrismaTypes } from "../src/generated/prisma/client.js"; // só tipos (apagado na execução)

if (process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Execução recusada: defina ALLOW_DEMO_SEED=true para criar/remover vendas demonstrativas.");
  process.exit(1);
}

const { prisma } = await import("../src/lib/prisma.js");
const { Prisma } = await import("../src/generated/prisma/client.js");
const { orderNumber } = await import("../src/lib/order-number.js");
const { hashPassword } = await import("../src/lib/password.js");

const SEED = 20261118;
const TOTAL_ORDERS = 30;
const PERIOD_DAYS = 120; // últimos 4 meses
const RECENT_ORDERS = 9; // os mais recentes, únicos que podem conter os produtos novos de novembro
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SAO_PAULO_OFFSET_H = 3; // America/Sao_Paulo sem horário de verão (UTC−3)

// Os 7 produtos novos de novembro (prisma/seed-new-products-2026-11.ts): todos aparecem em pelo menos um pedido.
const NOVEMBER_PRODUCTS = ["Camiseta Oversized Street", "Camiseta Baby Look Canelada", "Bermuda Cargo Trilha", "Calça Wide Leg Fluida",
  "Calça Moletom Kids", "Tênis Runner Leve", "Vestido Chemise Linho"];

// Status do mais recente (índice 0) ao mais antigo. Em andamento só nos 6 primeiros; cancelados espalhados entre os antigos.
type Status = "PENDING_CONFIRMATION" | "PREPARING" | "READY_OR_SHIPPED" | "COMPLETED" | "CANCELLED";
const STATUS_BY_RANK: Status[] = [
  "PENDING_CONFIRMATION", "PENDING_CONFIRMATION", "PREPARING", "PREPARING", "READY_OR_SHIPPED", "READY_OR_SHIPPED",
  ...Array.from({ length: TOTAL_ORDERS - 6 }, (_, i): Status => ([3, 9, 14, 20].includes(i) ? "CANCELLED" : "COMPLETED")),
];
// Idade (em fração da janela recente) dos pedidos recentes: do mais novo ao mais antigo.
const RECENT_FRACTIONS = [0.02, 0.08, 0.18, 0.27, 0.38, 0.47, 0.6, 0.75, 0.9];

// ─── Gerador determinístico (mulberry32) ─────────────────────────────────────
let state = SEED >>> 0;
function random() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T,>(items: readonly T[]) => items[int(0, items.length - 1)];

// ─── Clientes fictícios ──────────────────────────────────────────────────────
const CUSTOMERS = [
  ["Ana Ribeiro", "São Paulo", "SP", "Rua das Acácias", "Vila Mariana"],
  ["Bruno Carvalho", "Campinas", "SP", "Avenida das Palmeiras", "Cambuí"],
  ["Camila Souza", "Rio de Janeiro", "RJ", "Rua dos Ipês", "Botafogo"],
  ["Diego Martins", "Belo Horizonte", "MG", "Rua das Hortênsias", "Savassi"],
  ["Eduarda Lima", "Curitiba", "PR", "Alameda dos Jacarandás", "Batel"],
  ["Felipe Araújo", "Porto Alegre", "RS", "Rua das Orquídeas", "Moinhos de Vento"],
  ["Gabriela Costa", "Florianópolis", "SC", "Rua das Acácias", "Trindade"],
  ["Henrique Rocha", "Salvador", "BA", "Avenida das Palmeiras", "Barra"],
  ["Isabela Mendes", "Recife", "PE", "Rua dos Ipês", "Boa Viagem"],
  ["João Teixeira", "Brasília", "DF", "Rua das Hortênsias", "Asa Sul"],
  ["Larissa Gomes", "Goiânia", "GO", "Alameda dos Jacarandás", "Setor Bueno"],
  ["Mateus Ferreira", "São Paulo", "SP", "Rua das Orquídeas", "Pinheiros"],
  ["Natália Castro", "Fortaleza", "CE", "Rua das Acácias", "Aldeota"],
  ["Rafael Barbosa", "Vitória", "ES", "Avenida das Palmeiras", "Praia do Canto"],
] as const;
const slug = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, ".");
const customers = CUSTOMERS.map(([name, city, uf, street, neighborhood], index) => ({
  name, city, state: uf, street, neighborhood, number: String(100 + index * 37), email: `${slug(name)}${index + 1}@demonstrativo.com`,
}));

// ─── Contagens (só leitura) ──────────────────────────────────────────────────
type Db = Pick<PrismaTypes.TransactionClient, "order" | "orderItem" | "user">;
async function report(db: Db, title: string) {
  const [total, demo, demoItems, demoUsers, byStatus, real] = await Promise.all([
    db.order.count(),
    db.order.count({ where: { isDemo: true } }),
    db.orderItem.count({ where: { order: { isDemo: true } } }),
    db.user.count({ where: { isDemo: true } }),
    db.order.groupBy({ by: ["status"], where: { isDemo: true }, _count: { _all: true }, orderBy: { status: "asc" } }),
    db.order.findMany({ where: { isDemo: false }, orderBy: { sequence: "asc" }, select: { number: true, status: true, customerName: true, total: true, createdAt: true } }),
  ]);
  console.log(`\n${title}`);
  console.log(`  Pedidos: ${total} no total · ${demo} fictícios (${demoItems} itens) · ${real.length} reais`);
  console.log(`  Clientes fictícios: ${demoUsers}`);
  if (byStatus.length) console.log(`  Fictícios por status: ${byStatus.map(s => `${s.status}=${s._count._all}`).join(", ")}`);
  if (real.length) {
    console.log(`  ⚠ ${real.length} pedido(s) NÃO fictício(s) — nunca são apagados por este seed:`);
    for (const order of real) console.log(`    · ${order.number} | ${order.status} | ${order.customerName} | R$ ${order.total.toFixed(2)} | ${order.createdAt.toISOString().slice(0, 10)}`);
  }
  return { total, demo, real: real.length };
}

async function removeDemoData(tx: PrismaTypes.TransactionClient) {
  const items = await tx.orderItem.deleteMany({ where: { order: { isDemo: true } } });
  const orders = await tx.order.deleteMany({ where: { isDemo: true } }); // eventos de status saem em cascata
  // Só clientes fictícios sem pedidos restantes (a relação com Order é Restrict).
  const users = await tx.user.deleteMany({ where: { isDemo: true, orders: { none: {} } } });
  return { orders: orders.count, items: items.count, users: users.count };
}

try {
  const [{ name: database }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  console.log(`Banco: ${database}`);
  await report(prisma, "Antes:");

  if (process.argv.includes("--count")) {
    // Só leitura.
  } else if (process.argv.includes("--remove")) {
    const removed = await prisma.$transaction(tx => removeDemoData(tx));
    console.log(`\nRemovidos ${removed.orders} pedidos fictícios (${removed.items} itens) e ${removed.users} clientes fictícios.`);
    await report(prisma, "Depois:");
  } else await seed();
} finally {
  await prisma.$disconnect();
}

async function seed() {

  // ─── Catálogo real ─────────────────────────────────────────────────────────
  const products = (await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, price: true, createdAt: true, colors: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { colorName: true, variants: { orderBy: { id: "asc" }, select: { id: true, value: true } } } } },
  })).map(product => ({ ...product, colors: product.colors.filter(color => color.variants.length) })).filter(product => product.colors.length && Number(product.price) > 0);
  const novelties = NOVEMBER_PRODUCTS.map(name => products.find(product => product.name === name));
  const missing = NOVEMBER_PRODUCTS.filter((_, i) => !novelties[i]);
  if (missing.length) throw new Error(`Produtos novos de novembro ausentes, não publicados ou sem variantes: ${missing.join(", ")}.`);
  const novelProducts = novelties.map(product => product!);
  const regulars = products.filter(product => !NOVEMBER_PRODUCTS.includes(product.name));
  if (regulars.length < 3) throw new Error("O catálogo precisa de pelo menos 3 produtos publicados além dos novos de novembro.");

  const store = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  const pickupAddress = store?.storeCep && store.storeStreet && store.storeNumber && store.storeNeighborhood && store.storeCity && store.storeState
    ? { cep: store.storeCep, street: store.storeStreet, number: store.storeNumber, complement: store.storeComplement ?? "", neighborhood: store.storeNeighborhood, city: store.storeCity, state: store.storeState }
    : null;

  // ─── Datas ─────────────────────────────────────────────────────────────────
  const now = Date.now();
  const latestNovelty = Math.max(...novelProducts.map(product => product.createdAt.getTime()));
  // Pedidos recentes ficam depois do cadastro dos produtos novos (até 6 dias atrás) e antes de "agora".
  const recentStart = Math.max(latestNovelty, now - 6 * DAY_MS);
  const recentSpan = Math.max(now - 30 * 60_000 - recentStart, HOUR_MS);
  const atStoreHour = (day: number) => { // dia (em ms UTC à meia-noite de São Paulo) + horário comercial
    const hour = pick([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    return day + (hour + SAO_PAULO_OFFSET_H) * HOUR_MS + int(0, 59) * 60_000 + int(0, 59) * 1000;
  };
  const local = new Date(now - SAO_PAULO_OFFSET_H * HOUR_MS);
  const todaySaoPaulo = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const olderCount = TOTAL_ORDERS - RECENT_ORDERS;
  // Leva um horário recente para o horário comercial (10h–21h em São Paulo), sem sair da janela recente.
  const businessHour = (time: number) => {
    const hour = new Date(time - SAO_PAULO_OFFSET_H * HOUR_MS).getUTCHours();
    const shift = hour < 10 ? -(hour + 3) * HOUR_MS : hour > 21 ? -(hour - 21) * HOUR_MS : 0; // madrugada: 21h do dia anterior
    const moved = time + shift;
    return moved >= recentStart ? moved : time;
  };
  const times = [
    ...RECENT_FRACTIONS.map(fraction => businessHour(Math.round(now - 30 * 60_000 - fraction * recentSpan))).sort((a, b) => b - a),
    // Os mais antigos: espalhados de 7 a 120 dias atrás, com variação de ±2 dias.
    ...Array.from({ length: olderCount }, (_, i) => atStoreHour(todaySaoPaulo - Math.round(7 + (i / (olderCount - 1)) * (PERIOD_DAYS - 9) + int(-2, 2)) * DAY_MS)),
  ];

  // ─── Monta os pedidos (em memória) ─────────────────────────────────────────
  type Product = typeof products[number];
  type Item = { variantId: number; productName: string; colorName: string; size: string; quantity: number; unitPrice: InstanceType<typeof Prisma.Decimal> };
  const addItem = (items: Map<number, Item>, product: Product) => {
    const color = pick(product.colors);
    const variant = pick(color.variants);
    const quantity = random() < 0.8 ? 1 : 2;
    const previous = items.get(variant.id);
    if (previous) previous.quantity += quantity;
    else items.set(variant.id, { variantId: variant.id, productName: product.name, colorName: color.colorName, size: variant.value, quantity, unitPrice: new Prisma.Decimal(product.price) });
  };
  const plans = times.map((time, rank) => {
    const createdAt = new Date(time);
    const status = STATUS_BY_RANK[rank];
    const customer = customers[(rank * 5) % customers.length]; // todos os clientes compram; alguns mais de uma vez
    const fulfillmentMethod = pickupAddress && (status === "READY_OR_SHIPPED" || random() < 0.3) ? "PICKUP" as const : "DELIVERY" as const;
    const items = new Map<number, Item>();
    // Cada produto novo entra em um dos 7 pedidos mais recentes (todos posteriores ao cadastro deles).
    if (rank < novelProducts.length) addItem(items, novelProducts[rank]);
    const eligible = [...regulars, ...novelProducts.filter(product => product.createdAt.getTime() <= time)];
    const extra = int(items.size ? 0 : 1, 2);
    for (let i = 0; i < extra; i++) addItem(items, pick(eligible));
    // Linha do tempo de status coerente com a idade do pedido.
    const ageHours = (now - time) / HOUR_MS;
    const events: { status: Status; createdAt: Date }[] = [{ status: "PENDING_CONFIRMATION", createdAt }];
    let at = time;
    const step = (next: Status, share: number, maxHours: number) => {
      at = Math.min(at + Math.min(maxHours * HOUR_MS, (now - at) * share), now - 60_000);
      events.push({ status: next, createdAt: new Date(at) });
    };
    if (status === "CANCELLED") { if (random() < 0.5) step("PREPARING", 0.2, 6); step("CANCELLED", 0.3, 24); }
    else if (status !== "PENDING_CONFIRMATION") {
      step("PREPARING", 0.3, Math.min(6, ageHours / 3));
      if (status === "READY_OR_SHIPPED" || status === "COMPLETED") step("READY_OR_SHIPPED", 0.4, 30);
      if (status === "COMPLETED") step("COMPLETED", 0.3, fulfillmentMethod === "PICKUP" ? 30 : 96);
    }
    const last = events[events.length - 1].createdAt;
    return { createdAt, status, customer, fulfillmentMethod, items: [...items.values()], events, updatedAt: last, completedAt: status === "COMPLETED" ? last : null };
  }).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // numeração em ordem cronológica

  // ─── Grava tudo numa transação ─────────────────────────────────────────────
  const passwordHash = await hashPassword(randomBytes(32).toString("hex")); // senha aleatória descartada; contas inativas
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "OrderCounter" WHERE id = 1 FOR UPDATE`;
    const removed = await removeDemoData(tx);
    // Os fictícios continuam depois do maior pedido real (ou começam do 1), sem colidir e sempre com os mesmos números.
    const lastReal = await tx.order.aggregate({ _max: { sequence: true } });
    let sequence = lastReal._max.sequence ?? 0;

    const userIds = new Map<string, number>();
    for (const customer of customers) {
      const user = await tx.user.upsert({
        where: { email: customer.email },
        create: { name: customer.name, email: customer.email, passwordHash, active: false, isDemo: true, phone: null,
          address: { create: { cep: "00000000", street: customer.street, number: customer.number, complement: "", neighborhood: customer.neighborhood, city: customer.city, state: customer.state } } },
        update: {},
        select: { id: true, isDemo: true },
      });
      if (!user.isDemo) throw new Error(`O e-mail ${customer.email} pertence a uma conta real; seed interrompido sem alterações.`);
      userIds.set(customer.email, user.id);
    }
    let revenue = new Prisma.Decimal(0);
    for (const plan of plans) {
      sequence += 1;
      const total = plan.items.reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));
      if (plan.status === "COMPLETED") revenue = revenue.add(total);
      const number = orderNumber(sequence, plan.createdAt);
      await tx.order.create({ data: {
        number, sequence, isDemo: true, userId: userIds.get(plan.customer.email)!,
        status: plan.status, fulfillmentMethod: plan.fulfillmentMethod, customerName: plan.customer.name, customerPhone: null,
        deliveryAddress: plan.fulfillmentMethod === "DELIVERY" ? { cep: "00000000", street: plan.customer.street, number: plan.customer.number, complement: "", neighborhood: plan.customer.neighborhood, city: plan.customer.city, state: plan.customer.state } : Prisma.DbNull,
        pickupAddress: plan.fulfillmentMethod === "PICKUP" && pickupAddress ? pickupAddress : Prisma.DbNull,
        total, idempotencyKey: `demo-${number}`, requestHash: "demo", whatsappUrl: "", whatsappMessage: "Pedido demonstrativo (sem envio por WhatsApp).",
        createdAt: plan.createdAt, updatedAt: plan.updatedAt, completedAt: plan.completedAt,
        statusEvents: { create: plan.events },
        items: { create: plan.items.map(item => ({ variantId: item.variantId, originalVariantId: item.variantId, productName: item.productName,
          colorName: item.colorName, size: item.size, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.unitPrice.mul(item.quantity) })) },
      } });
    }
    // Próximo pedido real continua depois do último fictício.
    await tx.orderCounter.upsert({ where: { id: 1 }, create: { id: 1, value: sequence }, update: { value: sequence } });
    return { removed, revenue, first: sequence - plans.length + 1, last: sequence };
  }, { timeout: 120_000 });

  const byStatus = plans.reduce<Record<string, number>>((acc, plan) => ({ ...acc, [plan.status]: (acc[plan.status] ?? 0) + 1 }), {});
  const sold = new Set(plans.flatMap(plan => plan.items.map(item => item.productName)));
  console.log(`\nRemovidos: ${result.removed.orders} pedidos fictícios (${result.removed.items} itens) e ${result.removed.users} clientes fictícios.`);
  console.log(`Criados: ${plans.length} pedidos (sequência ${result.first}–${result.last}) de ${new Set(plans.map(p => p.customer.email)).size} clientes, ${plans.reduce((n, p) => n + p.items.length, 0)} itens, ${sold.size} produtos diferentes.`);
  console.log(`Produtos novos de novembro vendidos: ${NOVEMBER_PRODUCTS.filter(name => sold.has(name)).length}/${NOVEMBER_PRODUCTS.length}`);
  console.log(`Por status: ${JSON.stringify(byStatus)}`);
  console.log(`Faturamento finalizado: R$ ${result.revenue.toFixed(2)} · período ${plans[0].createdAt.toISOString().slice(0, 10)} a ${plans.at(-1)!.createdAt.toISOString().slice(0, 10)}`);
  await report(prisma, "Depois:");
}
