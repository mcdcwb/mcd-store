// Seed de vendas FICTÍCIAS (últimos 18 meses, com sazonalidade) para o Dashboard e os Relatórios da demonstração MCD Store.
//
// Uso (banco local):   ALLOW_DEMO_SEED=true DATABASE_URL=... npm run seed:demo-orders
// Remover os dados:    ALLOW_DEMO_SEED=true DATABASE_URL=... npm run seed:demo-orders -- --remove
//
// - Só roda com ALLOW_DEMO_SEED=true (nunca é chamado pelo build/deploy).
// - O destino do banco segue as travas de src/lib/prisma.ts: local mcd_store_demo, ou o Neon
//   autorizado com NODE_ENV=production e MCD_DEMO_ALLOW_REMOTE_DATABASE=1.
// - Idempotente: apaga tudo que tem isDemo = true e recria. Rodar duas vezes não duplica.
// - Determinístico: gerador aleatório com seed fixa (o padrão é sempre o mesmo, relativo à data do dia).
// - NÃO altera o estoque: os pedidos referenciam as variantes reais, mas nenhuma quantidade é baixada.
import { randomBytes } from "node:crypto";

if (process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Execução recusada: defina ALLOW_DEMO_SEED=true para criar/remover vendas demonstrativas.");
  process.exit(1);
}

const { prisma } = await import("../src/lib/prisma.js");
const { Prisma } = await import("../src/generated/prisma/client.js");
const { orderNumber } = await import("../src/lib/order-number.js");
const { hashPassword } = await import("../src/lib/password.js");

const SEED = 20261110;
const DAYS = 548; // últimos 18 meses
const TARGET_ORDERS = 820;
// Sazonalidade por mês (jan = 0): queda em janeiro, datas comemorativas e pico em novembro/dezembro.
const SEASONALITY = [0.62, 0.72, 0.85, 0.9, 1.12, 1.02, 0.88, 1.0, 0.95, 1.05, 1.55, 1.8];
const DAY_MS = 86_400_000;
const SAO_PAULO_OFFSET_H = 3; // America/Sao_Paulo sem horário de verão (UTC−3)

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
function weighted<T>(items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let roll = random() * total;
  for (const item of items) { roll -= weight(item); if (roll < 0) return item; }
  return items[items.length - 1];
}

// ─── Clientes fictícios ──────────────────────────────────────────────────────
const FIRST = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Lucas",
  "Mariana", "Mateus", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Thiago", "Vanessa", "Vinícius", "Beatriz", "Caio",
  "Daniela", "Enzo", "Fernanda", "Gustavo", "Helena", "Igor", "Júlia", "Leonardo", "Luana", "Marcelo", "Nicole", "Pedro",
  "Renata", "Samuel", "Tatiane", "Yasmin", "André", "Carolina", "Rodrigo", "Letícia"];
const LAST = ["Almeida", "Barbosa", "Cardoso", "Carvalho", "Costa", "Dias", "Ferreira", "Gomes", "Lima", "Martins", "Moreira",
  "Nascimento", "Oliveira", "Pereira", "Ribeiro", "Rocha", "Santos", "Silva", "Souza", "Teixeira", "Vieira", "Araújo", "Castro", "Mendes"];
const CITIES = [["São Paulo", "SP", 9], ["Campinas", "SP", 3], ["Rio de Janeiro", "RJ", 6], ["Belo Horizonte", "MG", 4], ["Curitiba", "PR", 4],
  ["Porto Alegre", "RS", 3], ["Florianópolis", "SC", 2], ["Salvador", "BA", 3], ["Recife", "PE", 2], ["Fortaleza", "CE", 2],
  ["Brasília", "DF", 3], ["Goiânia", "GO", 2], ["Vitória", "ES", 1], ["Manaus", "AM", 1], ["Belém", "PA", 1], ["Natal", "RN", 1]] as const;
const STREETS = ["Rua das Acácias", "Avenida das Palmeiras", "Rua dos Ipês", "Rua das Hortênsias", "Alameda dos Jacarandás", "Rua das Orquídeas"];
const slug = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function removeDemoData(tx: Prisma.TransactionClient) {
  // Itens e eventos dos pedidos saem em cascata; endereços dos clientes também.
  const orders = await tx.order.deleteMany({ where: { isDemo: true } });
  const users = await tx.user.deleteMany({ where: { isDemo: true } });
  return { orders: orders.count, users: users.count };
}

try {
  const [{ name: database }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  console.log(`Banco: ${database}`);

  if (process.argv.includes("--remove")) {
    const removed = await prisma.$transaction(tx => removeDemoData(tx));
    console.log(`Removidos ${removed.orders} pedidos e ${removed.users} clientes demonstrativos.`);
    process.exit(0);
  }

  // ─── Catálogo real ─────────────────────────────────────────────────────────
  const products = (await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, price: true, colors: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { colorName: true, variants: { orderBy: { id: "asc" }, select: { id: true, value: true } } } } },
  })).map(product => ({ ...product, colors: product.colors.filter(color => color.variants.length) })).filter(product => product.colors.length);
  if (!products.length) throw new Error("Nenhum produto publicado com variantes: cadastre o catálogo antes do seed.");
  // Popularidade decrescente (com ordem embaralhada pela seed): alguns produtos lideram o ranking.
  const popularity = new Map(products.map(product => [product.id, 0]));
  [...products].sort(() => random() - 0.5).forEach((product, rank) => popularity.set(product.id, 1 / Math.pow(rank + 1, 0.9)));

  const store = await prisma.storeSettings.findUnique({ where: { id: 1 } });
  const pickupAddress = store?.storeCep && store.storeStreet && store.storeNumber && store.storeNeighborhood && store.storeCity && store.storeState
    ? { cep: store.storeCep, street: store.storeStreet, number: store.storeNumber, complement: store.storeComplement ?? "", neighborhood: store.storeNeighborhood, city: store.storeCity, state: store.storeState }
    : null;

  // ─── Clientes ──────────────────────────────────────────────────────────────
  const customerCount = 48;
  const usedNames = new Set<string>();
  const customers = Array.from({ length: customerCount }, (_, index) => {
    let name: string;
    do name = `${FIRST[int(0, FIRST.length - 1)]} ${LAST[int(0, LAST.length - 1)]}`; while (usedNames.has(name));
    usedNames.add(name);
    const [city, uf] = weighted(CITIES, city => city[2]);
    return {
      name, email: `${slug(name).replace(" ", ".")}${index + 1}@demonstrativo.com`, city, state: uf,
      street: STREETS[int(0, STREETS.length - 1)], number: String(int(10, 1999)),
      loyalty: 0.4 + random() * 2.2 * (index % 7 === 0 ? 2 : 1), // alguns clientes compram bem mais vezes
    };
  });

  // ─── Distribuição dos pedidos nos últimos 90 dias ──────────────────────────
  const now = new Date();
  const localToday = new Date(now.getTime() - SAO_PAULO_OFFSET_H * 3_600_000); // "relógio" de São Paulo em UTC
  const todayUtc = Date.UTC(localToday.getUTCFullYear(), localToday.getUTCMonth(), localToday.getUTCDate());
  const blackFriday = (year: number) => { const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay(); return Date.UTC(year, 10, 1 + ((4 - nov1 + 7) % 7) + 22); };
  const spikes = new Map<number, number>();
  const secondSunday = (year: number, month: number) => { const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); return Date.UTC(year, month, 1 + ((7 - first) % 7) + 7); };
  const days3 = (day: number, factors: number[]) => factors.forEach((f, i) => spikes.set(day - (factors.length - 1 - i) * DAY_MS, f));
  for (const year of [localToday.getUTCFullYear() - 2, localToday.getUTCFullYear() - 1, localToday.getUTCFullYear()]) {
    days3(secondSunday(year, 4), [1.5, 1.9, 1.3]); // Dia das Mães (2º domingo de maio)
    days3(Date.UTC(year, 5, 12), [1.4, 1.7, 1.2]);  // Dia dos Namorados
    days3(secondSunday(year, 7), [1.4, 1.7, 1.2]);  // Dia dos Pais (2º domingo de agosto)
    for (let d = 15; d <= 23; d++) spikes.set(Date.UTC(year, 11, d), 1.35); // compras de Natal
    const bf = blackFriday(year);
    [[bf - DAY_MS, 1.8], [bf, 3.6], [bf + DAY_MS, 2.4], [bf + 2 * DAY_MS, 1.6], [bf + 3 * DAY_MS, 2.2]].forEach(([d, f]) => spikes.set(d, f)); // até a Cyber Monday
    [[Date.UTC(year, 9, 10), 1.7], [Date.UTC(year, 9, 11), 2.0], [Date.UTC(year, 9, 12), 1.5]].forEach(([d, f]) => spikes.set(d, f)); // Dia das Crianças
    [[Date.UTC(year, 8, 22), 1.6], [Date.UTC(year, 8, 23), 1.4]].forEach(([d, f]) => spikes.set(d, f)); // campanha de primavera
  }
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = todayUtc - (DAYS - 1 - i) * DAY_MS;
    const weekday = new Date(date).getUTCDay();
    const trend = 0.72 + 0.5 * (i / (DAYS - 1)); // leve crescimento ao longo dos 18 meses
    const season = SEASONALITY[new Date(date).getUTCMonth()];
    const weekend = weekday === 0 || weekday === 6 ? 1.55 : weekday === 5 ? 1.2 : 1;
    const noise = 0.75 + random() * 0.5;
    return { date, weight: trend * season * weekend * noise * (spikes.get(date) ?? 1) };
  });
  const totalWeight = days.reduce((sum, day) => sum + day.weight, 0);
  const orderTimes: Date[] = [];
  for (const day of days) {
    const expected = day.weight / totalWeight * TARGET_ORDERS;
    const count = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
    for (let n = 0; n < count; n++) {
      const hour = weighted([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], h => (h >= 19 && h <= 21 ? 3 : h >= 12 && h <= 14 ? 2 : 1));
      const at = new Date(day.date + (hour + SAO_PAULO_OFFSET_H) * 3_600_000 + int(0, 59) * 60_000 + int(0, 59) * 1000);
      if (at < now) orderTimes.push(at);
    }
  }
  orderTimes.sort((a, b) => a.getTime() - b.getTime());

  // ─── Monta os pedidos (em memória) ─────────────────────────────────────────
  type Status = "PENDING_CONFIRMATION" | "PREPARING" | "READY_OR_SHIPPED" | "COMPLETED" | "CANCELLED";
  const hours = (h: number) => h * 3_600_000;
  const capped = (date: Date) => new Date(Math.min(date.getTime(), now.getTime() - 60_000));
  const plans = orderTimes.map(createdAt => {
    const ageDays = (now.getTime() - createdAt.getTime()) / DAY_MS;
    const status: Status = ageDays < 1 ? weighted(["PENDING_CONFIRMATION", "PREPARING", "CANCELLED"] as const, s => ({ PENDING_CONFIRMATION: 5, PREPARING: 4, CANCELLED: 0.5 }[s]))
      : ageDays < 3 ? weighted(["PREPARING", "READY_OR_SHIPPED", "COMPLETED", "CANCELLED"] as const, s => ({ PREPARING: 4, READY_OR_SHIPPED: 4, COMPLETED: 1.5, CANCELLED: 0.5 }[s]))
      : ageDays < 7 ? weighted(["READY_OR_SHIPPED", "COMPLETED", "CANCELLED"] as const, s => ({ READY_OR_SHIPPED: 3, COMPLETED: 6, CANCELLED: 0.6 }[s]))
      : weighted(["COMPLETED", "CANCELLED"] as const, s => ({ COMPLETED: 94, CANCELLED: 6 }[s]));
    const customer = weighted(customers, c => c.loyalty);
    const fulfillmentMethod = pickupAddress && customer.city === pickupAddress.city && random() < 0.45 ? "PICKUP" as const : "DELIVERY" as const;
    const itemCount = weighted([1, 2, 3, 4], n => ({ 1: 45, 2: 30, 3: 17, 4: 8 }[n]!));
    const items = new Map<number, { variantId: number; productName: string; colorName: string; size: string; quantity: number; unitPrice: InstanceType<typeof Prisma.Decimal> }>();
    for (let i = 0; i < itemCount; i++) {
      const product = weighted(products, p => popularity.get(p.id)!);
      const color = weighted(product.colors, c => (c === product.colors[0] ? 2 : 1));
      const middle = (color.variants.length - 1) / 2;
      const variant = weighted(color.variants, v => 1 / (1 + Math.abs(color.variants.indexOf(v) - middle))); // tamanhos do meio vendem mais
      const quantity = random() < 0.85 ? 1 : 2;
      const previous = items.get(variant.id);
      if (previous) previous.quantity += quantity;
      else items.set(variant.id, { variantId: variant.id, productName: product.name, colorName: color.colorName, size: variant.value, quantity, unitPrice: new Prisma.Decimal(product.price) });
    }
    // Linha do tempo de status coerente com a idade do pedido.
    const events: { status: Status; createdAt: Date }[] = [{ status: "PENDING_CONFIRMATION", createdAt }];
    let at = createdAt.getTime();
    const step = (status: Status, minH: number, maxH: number) => { at += hours(minH + random() * (maxH - minH)); events.push({ status, createdAt: capped(new Date(at)) }); };
    if (status === "CANCELLED") { if (random() < 0.5) step("PREPARING", 1, 8); step("CANCELLED", 2, 30); }
    else if (status !== "PENDING_CONFIRMATION") {
      step("PREPARING", 0.5, Math.min(8, Math.max(0.6, ageDays * 12)));
      if (status === "READY_OR_SHIPPED" || status === "COMPLETED") step("READY_OR_SHIPPED", 6, 30);
      if (status === "COMPLETED") step("COMPLETED", fulfillmentMethod === "PICKUP" ? 3 : 20, fulfillmentMethod === "PICKUP" ? 30 : 96);
    }
    const last = events[events.length - 1].createdAt;
    return { createdAt, status, customer, fulfillmentMethod, items: [...items.values()], events, updatedAt: last, completedAt: status === "COMPLETED" ? last : null };
  });

  // ─── Grava tudo numa transação ─────────────────────────────────────────────
  const passwordHash = await hashPassword(randomBytes(32).toString("hex")); // senha aleatória descartada; contas inativas
  const result = await prisma.$transaction(async tx => {
    const removed = await removeDemoData(tx);
    // Sem pedidos reais, a numeração recomeça do zero (resultado sempre igual);
    // com pedidos reais, os demonstrativos continuam a sequência sem colidir.
    const realOrders = await tx.order.count();
    await tx.$queryRaw`SELECT id FROM "OrderCounter" WHERE id = 1 FOR UPDATE`;
    if (!realOrders) await tx.orderCounter.upsert({ where: { id: 1 }, create: { id: 1, value: 0 }, update: { value: 0 } });
    let sequence = (await tx.orderCounter.findUniqueOrThrow({ where: { id: 1 } })).value;

    const userIds = new Map<string, number>();
    for (const customer of customers) {
      const user = await tx.user.create({ data: {
        name: customer.name, email: customer.email, passwordHash, active: false, isDemo: true, phone: null,
        address: { create: { cep: "00000000", street: customer.street, number: customer.number, complement: "", neighborhood: "Centro", city: customer.city, state: customer.state } },
      }, select: { id: true } });
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
        deliveryAddress: plan.fulfillmentMethod === "DELIVERY" ? { cep: "00000000", street: plan.customer.street, number: plan.customer.number, complement: "", neighborhood: "Centro", city: plan.customer.city, state: plan.customer.state } : Prisma.DbNull,
        pickupAddress: plan.fulfillmentMethod === "PICKUP" && pickupAddress ? pickupAddress : Prisma.DbNull,
        total, idempotencyKey: `demo-${number}`, requestHash: "demo", whatsappUrl: "", whatsappMessage: "Pedido demonstrativo (sem envio por WhatsApp).",
        createdAt: plan.createdAt, updatedAt: plan.updatedAt, completedAt: plan.completedAt,
        statusEvents: { create: plan.events },
        items: { create: plan.items.map(item => ({ variantId: item.variantId, originalVariantId: item.variantId, productName: item.productName,
          colorName: item.colorName, size: item.size, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.unitPrice.mul(item.quantity) })) },
      } });
    }
    await tx.orderCounter.update({ where: { id: 1 }, data: { value: sequence } });
    return { removed, revenue };
  }, { timeout: 120_000 });

  const byStatus = plans.reduce<Record<string, number>>((acc, plan) => ({ ...acc, [plan.status]: (acc[plan.status] ?? 0) + 1 }), {});
  console.log(`Removidos antes: ${result.removed.orders} pedidos e ${result.removed.users} clientes demonstrativos.`);
  console.log(`Criados: ${plans.length} pedidos de ${customers.length} clientes (${new Set(plans.map(p => p.customer.email)).size} compraram), ${plans.reduce((n, p) => n + p.items.length, 0)} itens.`);
  console.log(`Por status: ${JSON.stringify(byStatus)}`);
  console.log(`Faturamento concluído: R$ ${result.revenue.toFixed(2)} · período ${orderTimes[0]?.toISOString().slice(0, 10)} a ${orderTimes.at(-1)?.toISOString().slice(0, 10)}`);
} finally {
  await prisma.$disconnect();
}
