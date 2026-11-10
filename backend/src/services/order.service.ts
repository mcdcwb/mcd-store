import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { orderListSchema } from "../schemas/order.schema.js";
import { BUSINESS_TIME_ZONE } from "../config/business.js";

const orderSummarySelect = {
  id: true, number: true, sequence: true, customerName: true, createdAt: true,
  total: true, fulfillmentMethod: true, status: true, isDemo: true
} satisfies Prisma.OrderSelect;

// nameSearchOnlyDemo (painel em modo leitura): o nome do cliente só é pesquisável em pedidos
// fictícios (isDemo); pedidos reais só aparecem pela busca por número. Isso impede descobrir se
// uma pessoa real comprou na loja digitando o nome dela.
export async function listOrders(input: z.infer<typeof orderListSchema>, options: { nameSearchOnlyDemo?: boolean } = {}) {
  const nameMatch: Prisma.OrderWhereInput = { customerName: { contains: input.search, mode: "insensitive" } };
  const where: Prisma.OrderWhereInput = {
    archivedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { OR: [
      { number: { contains: input.search.replace(/^#/, "") } },
      options.nameSearchOnlyDemo ? { ...nameMatch, isDemo: true } : nameMatch
    ] } : {})
  };
  return prisma.$transaction(async tx => {
    const total = await tx.order.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
    const page = Math.min(input.page, totalPages);
    const items = await tx.order.findMany({ where, select: orderSummarySelect,
      orderBy: input.sort === "number" ? [{ sequence: input.direction }] : [{ createdAt: input.direction }, { sequence: input.direction }],
      skip: (page - 1) * input.pageSize, take: input.pageSize });
    return { items, total, page, pageSize: input.pageSize, totalPages };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getOrder(id: number) {
  const order = await prisma.order.findFirst({ where: { id, archivedAt: null }, select: {
    ...orderSummarySelect, updatedAt: true, deliveryAddress: true, pickupAddress: true,
    completedAt: true, archivedAt: true, customerPhone: true,
    items: { orderBy: { id: "asc" }, select: {
      id: true, productName: true, colorName: true, size: true, quantity: true, unitPrice: true, subtotal: true
    } }
  } });
  if (!order) throw new OrderError(404, "Pedido não encontrado.");
  return order;
}
export async function listCustomerOrders(userId: number) {
  const orders = await prisma.order.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { sequence: "desc" }], select: {
    id: true, number: true, createdAt: true, status: true, fulfillmentMethod: true,
    deliveryAddress: true, pickupAddress: true, total: true,
    statusEvents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { status: true, createdAt: true } },
    items: { orderBy: { id: "asc" }, select: { id: true, productName: true, colorName: true, size: true, quantity: true, unitPrice: true, subtotal: true } }
  } });
  return orders;
}
export interface StockConflict {
  variantId: number; productName: string; colorName: string; size: string; requested: number; available: number;
}
export class OrderError extends Error {
  constructor(public status: number, message: string, public conflicts?: StockConflict[]) { super(message); }
}
export async function cancelOrder(id: number, expectedStatus: "PENDING_CONFIRMATION" | "PREPARING" | "READY_OR_SHIPPED") {
  if (!["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED"].includes(expectedStatus))
    throw new OrderError(409, "Este status não permite cancelamento.");
  return prisma.$transaction(async tx => {
    // Same order-first lock discipline as confirmation. Advance also locks this
    // row through its conditional UPDATE, so all three operations serialize.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id }, include: { items: { orderBy: { id: "asc" } } } });
    if (!order) throw new OrderError(404, "Pedido não encontrado.");
    if (order.archivedAt) throw new OrderError(409, "O pedido foi arquivado e não pode ser atualizado operacionalmente.");
    if (order.status !== expectedStatus)
      throw new OrderError(409, "O status do pedido mudou ou não permite cancelamento. Confira os dados atualizados.");
    // Pedidos demonstrativos (seed) nunca baixaram estoque: cancelar não devolve unidades.
    if (order.status !== "PENDING_CONFIRMATION" && !order.isDemo) {
      if (!order.items.length) throw new OrderError(409, "Pedido sem itens para repor estoque.");
      const quantities = new Map<number, number>();
      for (const item of order.items) {
        if (item.variantId === null || item.variantId !== item.originalVariantId)
          throw new OrderError(409, `Não foi possível repor o estoque de ${item.productName} / ${item.colorName} / ${item.size}: a variante original não está disponível. O pedido não foi cancelado.`);
        const quantity = (quantities.get(item.variantId) ?? 0) + item.quantity;
        if (item.quantity <= 0 || !Number.isSafeInteger(quantity) || quantity > 2147483647)
          throw new OrderError(409, "Quantidade inválida para reposição. O pedido não foi cancelado.");
        quantities.set(item.variantId, quantity);
      }
      const ids = [...quantities.keys()].sort((a, b) => a - b);
      const variants = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
        SELECT id FROM "ProductVariant" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      if (variants.length !== ids.length)
        throw new OrderError(409, "Uma variante original foi removida. O pedido não foi cancelado e nenhum estoque foi devolvido.");
      for (const variantId of ids) {
        const quantity = quantities.get(variantId)!;
        // Increment the current value; never restore a stale stock snapshot.
        const updated = await tx.productVariant.updateMany({
          where: { id: variantId, stock: { lte: 2147483647 - quantity } },
          data: { stock: { increment: quantity } }
        });
        if (updated.count !== 1)
          throw new OrderError(409, "A reposição excede o limite de estoque. O pedido não foi cancelado e nenhuma reposição foi aplicada.");
      }
    }
    const changedAt = new Date();
    const updated = await tx.order.update({ where: { id }, data: { status: "CANCELLED", updatedAt: changedAt }, select: { id: true, number: true, status: true, updatedAt: true } });
    await tx.orderStatusEvent.create({ data: { orderId: id, status: "CANCELLED", createdAt: changedAt } });
    return updated;
  }, { isolationLevel: "ReadCommitted" });
}
export async function advanceOrder(id: number, expectedStatus: "PREPARING" | "READY_OR_SHIPPED") {
  // Validate here as well: callers cannot bypass confirmation or choose a target.
  if (expectedStatus !== "PREPARING" && expectedStatus !== "READY_OR_SHIPPED")
    throw new OrderError(409, "Transição de status inválida.");
  const status = expectedStatus === "PREPARING" ? "READY_OR_SHIPPED" : "COMPLETED";
  return prisma.$transaction(async tx => {
    const changedAt = new Date();
    const updated = await tx.order.updateMany({ where: { id, status: expectedStatus, archivedAt: null }, data: { status, updatedAt: changedAt, ...(status === "COMPLETED" ? { completedAt: changedAt } : {}) } });
    if (updated.count !== 1) {
      const order = await tx.order.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
      if (!order) throw new OrderError(404, "Pedido não encontrado.");
      if (order.archivedAt) throw new OrderError(409, "O pedido foi arquivado e não pode ser atualizado operacionalmente.");
      throw new OrderError(409, "O status do pedido mudou ou não permite esta ação. Confira os dados atualizados.");
    }
    await tx.orderStatusEvent.create({ data: { orderId: id, status, createdAt: changedAt } });
    return tx.order.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, status: true, updatedAt: true, completedAt: true } });
  }, { isolationLevel: "ReadCommitted" });
}
export async function archiveOrder(id: number) {
  const updated = await prisma.order.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
  if (!updated.count) {
    const order = await prisma.order.findUnique({ where: { id }, select: { archivedAt: true } });
    if (!order) throw new OrderError(404, "Pedido não encontrado.");
    throw new OrderError(409, "O pedido já foi arquivado.");
  }
  return prisma.order.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, archivedAt: true } });
}

function monthStart(date: Date, offset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = Number(parts.find(part => part.type === "year")!.value);
  const month = Number(parts.find(part => part.type === "month")!.value) - 1 + offset;
  const localMonth = new Date(Date.UTC(year, month, 1));
  const target = `${localMonth.getUTCFullYear()}-${String(localMonth.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00`;
  const utcGuess = new Date(`${target}Z`);
  const zoned = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(utcGuess);
  const value = (type: string) => Number(zoned.find(part => part.type === type)!.value);
  const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return new Date(utcGuess.getTime() + utcGuess.getTime() - represented);
}
// Data local (America/Sao_Paulo) em "AAAA-MM-DD" e a segunda-feira da semana dessa data.
const localDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
function mondayOf(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
const WEEKS = 13;
// Últimas 13 semanas (segunda a domingo): faturamento concluído (pela data de conclusão)
// e pedidos recebidos (pela data de criação, sem cancelados).
async function weeklyReport(now: Date) {
  const current = mondayOf(localDay(now));
  const weeks = Array.from({ length: WEEKS }, (_, index) => {
    const date = new Date(`${current}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (WEEKS - 1 - index) * 7);
    return date.toISOString().slice(0, 10);
  });
  const since = new Date(now.getTime() - (WEEKS * 7 + 1) * 86_400_000);
  const [completed, received] = await Promise.all([
    prisma.order.findMany({ where: { status: "COMPLETED", completedAt: { gte: since } }, select: { total: true, completedAt: true } }),
    prisma.order.findMany({ where: { status: { not: "CANCELLED" }, createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  return weeks.map(week => ({
    week,
    revenue: completed.filter(order => order.completedAt && mondayOf(localDay(order.completedAt)) === week)
      .reduce((sum, order) => sum.add(order.total), new Prisma.Decimal(0)).toFixed(2),
    orders: received.filter(order => mondayOf(localDay(order.createdAt)) === week).length,
  }));
}
export async function orderReports(now = new Date()) {
  const currentMonth = monthStart(now, 0);
  const start = monthStart(now, -5);
  const end = monthStart(now, 1);
  const reportPeriod = { status: "COMPLETED" as const, completedAt: { gte: start, lt: end } };
  const orders = await prisma.order.findMany({ where: reportPeriod, select: { total: true, completedAt: true } });
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = monthStart(currentMonth, index - 5);
    const amount = orders.filter(order => order.completedAt && order.completedAt >= date && order.completedAt < monthStart(date, 1))
      .reduce((sum, order) => sum.add(order.total), new Prisma.Decimal(0));
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" }).format(date);
    return { month, revenue: amount.toFixed(2) };
  });
  const grouped = await prisma.orderItem.groupBy({ by: ["productName"], where: { order: reportPeriod }, _sum: { quantity: true } });
  const ranking = grouped.map(item => ({ productName: item.productName, quantity: item._sum.quantity ?? 0 })).filter(item => item.quantity > 0);
  const topProducts = [...ranking].sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName)).slice(0, 5);
  const lowestProducts = [...ranking].sort((a, b) => a.quantity - b.quantity || a.productName.localeCompare(b.productName)).slice(0, 5);
  const revenue = await prisma.order.aggregate({ where: { status: "COMPLETED" }, _sum: { total: true }, _count: { _all: true } });
  const total = revenue._sum.total ?? new Prisma.Decimal(0);
  const [weekly, totalOrders, demoOrders] = await Promise.all([weeklyReport(now), prisma.order.count({ where: { archivedAt: null } }), prisma.order.count({ where: { isDemo: true } })]);
  return { revenue: total.toFixed(2), completedOrders: revenue._count._all,
    averageTicket: revenue._count._all ? total.div(revenue._count._all).toFixed(2) : "0.00", monthly,
    topProducts, lowestProducts, weekly, totalOrders, hasDemoData: demoOrders > 0 };
}
// ─── Relatório por período ─────────────────────────────────────────────────
// Regra mantida: só pedidos FINALIZADOS (status COMPLETED), pela data de conclusão — o que já
// exclui cancelados e pedidos em andamento. Agregação no Postgres, no fuso da loja.
export type ReportGroupBy = "day" | "week" | "month" | "year";
const DAY_MS = 86_400_000;
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
export function validateReportPeriod(start: string, end: string, groupBy: ReportGroupBy, today = localDay(new Date())) {
  if (start > end) throw new OrderError(400, "A data inicial deve ser anterior ou igual à final.");
  if (end > today) throw new OrderError(400, "O período não pode terminar no futuro.");
  const days = daysBetween(start, end);
  if (days > 5 * 366) throw new OrderError(400, "O período máximo é de 5 anos.");
  if (groupBy === "day" && days > 90) throw new OrderError(400, "Agrupamento diário só para períodos de até 90 dias.");
  if (groupBy === "year" && days < 365) throw new OrderError(400, "Agrupamento anual só para períodos de 1 ano ou mais.");
  return days;
}
// Limites [início 00:00, fim + 1 dia 00:00) no fuso da loja, convertidos para o UTC gravado no banco.
const completedInPeriod = (start: string, end: string) => Prisma.sql`
  o.status = 'COMPLETED'
  AND o."completedAt" >= ((${start}::date)::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE}) AT TIME ZONE 'UTC'
  AND o."completedAt" < ((${end}::date + 1)::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE}) AT TIME ZONE 'UTC'`;
async function periodSeries(start: string, end: string, groupBy: ReportGroupBy) {
  // generate_series preenche com zero os períodos sem vendas (o gráfico não fica com buracos).
  const rows = await prisma.$queryRaw<{ bucket: string; revenue: string; orders: number }[]>`
    WITH sales AS (
      SELECT date_trunc(${groupBy}::text, (o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE}) AS bucket, o.total
      FROM "Order" o WHERE ${completedInPeriod(start, end)}
    )
    SELECT to_char(b.bucket, 'YYYY-MM-DD') AS bucket, COALESCE(SUM(s.total), 0)::text AS revenue, COUNT(s.total)::int AS orders
    FROM generate_series(date_trunc(${groupBy}::text, ${start}::date::timestamp), ${end}::date::timestamp, ('1 ' || ${groupBy}::text)::interval) AS b(bucket)
    LEFT JOIN sales s ON s.bucket = b.bucket
    GROUP BY b.bucket ORDER BY b.bucket`;
  return rows.map(row => ({ bucket: row.bucket, revenue: new Prisma.Decimal(row.revenue).toFixed(2), orders: row.orders }));
}
async function periodSummary(start: string, end: string) {
  const [row] = await prisma.$queryRaw<{ revenue: string; orders: number }[]>`
    SELECT COALESCE(SUM(o.total), 0)::text AS revenue, COUNT(*)::int AS orders FROM "Order" o WHERE ${completedInPeriod(start, end)}`;
  const revenue = new Prisma.Decimal(row.revenue);
  return { revenue: revenue.toFixed(2), orders: row.orders, averageTicket: row.orders ? revenue.div(row.orders).toFixed(2) : "0.00" };
}
async function periodRanking(start: string, end: string) {
  const rows = await prisma.$queryRaw<{ productName: string; quantity: number }[]>`
    SELECT i."productName", SUM(i.quantity)::int AS quantity FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE ${completedInPeriod(start, end)} GROUP BY i."productName" HAVING SUM(i.quantity) > 0`;
  return {
    topProducts: [...rows].sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName)).slice(0, 5),
    lowestProducts: [...rows].sort((a, b) => a.quantity - b.quantity || a.productName.localeCompare(b.productName)).slice(0, 5),
  };
}
export async function periodReport(input: { start: string; end: string; groupBy: ReportGroupBy; compare: boolean }) {
  const days = validateReportPeriod(input.start, input.end, input.groupBy);
  // Período anterior: mesma duração, terminando no dia antes do início.
  const previous = { start: addDays(input.start, -days), end: addDays(input.start, -1) };
  const [series, summary, ranking, previousSeries, previousSummary] = await Promise.all([
    periodSeries(input.start, input.end, input.groupBy), periodSummary(input.start, input.end), periodRanking(input.start, input.end),
    input.compare ? periodSeries(previous.start, previous.end, input.groupBy) : null,
    input.compare ? periodSummary(previous.start, previous.end) : null,
  ]);
  return {
    period: { start: input.start, end: input.end, groupBy: input.groupBy, days },
    summary, ...ranking,
    // A série anterior é alinhada por posição (1º período com 1º período, e assim por diante).
    series: series.map((point, index) => ({ ...point, ...(previousSeries ? {
      previousBucket: previousSeries[index]?.bucket ?? null, previousRevenue: previousSeries[index]?.revenue ?? "0.00", previousOrders: previousSeries[index]?.orders ?? 0,
    } : {}) })),
    previous: previousSummary ? { ...previous, ...previousSummary } : null,
  };
}
export async function confirmOrder(id: number) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id }, include: { items: { orderBy: { id: "asc" } } } });
    if (!order) throw new OrderError(404, "Pedido não encontrado.");
    if (order.archivedAt) throw new OrderError(409, "O pedido foi arquivado e não pode ser atualizado operacionalmente.");
    if (order.status !== "PENDING_CONFIRMATION") throw new OrderError(409, "O pedido não está aguardando confirmação.");
    if (!order.items.length) throw new OrderError(409, "Pedido sem itens.");
    // Pedidos demonstrativos (seed) não mexem no estoque real.
    const ids = order.isDemo ? [] : [...new Set(order.items.flatMap(item => item.variantId === null ? [] : [item.variantId]))].sort((a, b) => a - b);
    const variants = ids.length ? await tx.$queryRaw<{ id: number; stock: number }[]>(Prisma.sql`
      SELECT id, stock FROM "ProductVariant" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`) : [];
    const quantities = new Map<number, number>();
    for (const item of order.items) quantities.set(item.originalVariantId, (quantities.get(item.originalVariantId) ?? 0) + item.quantity);
    const conflicts = order.isDemo ? [] : order.items.flatMap(item => {
      const available = variants.find(v => v.id === item.variantId)?.stock ?? 0;
      const requested = quantities.get(item.originalVariantId)!;
      return item.variantId === null || available < requested ? [{ variantId: item.originalVariantId,
        productName: item.productName, colorName: item.colorName, size: item.size, requested, available }] : [];
    });
    if (conflicts.length) throw new OrderError(409, "Estoque insuficiente para confirmar o pedido.", conflicts);
    for (const variantId of ids) {
      const quantity = order.items.filter(item => item.variantId === variantId).reduce((sum, item) => sum + item.quantity, 0);
      const updated = await tx.productVariant.updateMany({ where: { id: variantId, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
      if (updated.count !== 1) throw new OrderError(409, "O estoque mudou. Tente novamente.");
    }
    const changedAt = new Date();
    await tx.order.update({ where: { id }, data: { status: "PREPARING", updatedAt: changedAt }, select: { id: true } });
    await tx.orderStatusEvent.create({ data: { orderId: id, status: "PREPARING", createdAt: changedAt } });
    return tx.order.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, status: true, updatedAt: true } });
  }, { isolationLevel: "ReadCommitted" });
}
