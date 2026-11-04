import assert from "node:assert/strict";
import test from "node:test";
import { createManagerApi } from "../src/app/manager/api.ts";
import { orderMoney, orderDate, orderQueryString, orderStatusLabels, orderStatusLabel, orderAction, canCancelOrder, orderCancellationDescription } from "../src/app/manager/orders.ts";

test("order cancellation uses the authenticated expected-state contract and useful errors", async () => {
  const calls = [];
  const api = createManagerApi("admin", "/api", async (url, init) => { calls.push({ url, init }); return Response.json({ id: 7, status: "CANCELLED" }); });
  for (const expectedStatus of ["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED"]) {
    assert.equal(canCancelOrder(expectedStatus), true);
    const result = await api.cancelOrder(7, expectedStatus);
    assert.equal(result.status, "CANCELLED");
    assert.deepEqual(JSON.parse(calls.at(-1).init.body), { expectedStatus });
  }
  assert.ok(calls.every(c => c.url === "/api/orders/7/cancel" && c.init.method === "POST" && c.init.headers.Authorization === "Bearer admin"));
  for (const status of ["COMPLETED", "CANCELLED"]) assert.equal(canCancelOrder(status), false);
  assert.match(orderCancellationDescription("PENDING_CONFIRMATION"), /não houve baixa de estoque/);
  for (const status of ["PREPARING", "READY_OR_SHIPPED"]) assert.equal(orderCancellationDescription(status), "O estoque deste pedido será devolvido.");
  const failing = createManagerApi("admin", "/api", async () => Response.json({ error: "A variante original não está disponível." }, { status: 409 }));
  await assert.rejects(failing.cancelOrder(7, "PREPARING"), error => error.status === 409 && error.message.includes("variante original"));
});

test("order API sends combined validated controls and keeps stock conflicts", async () => {
  const calls = [], query = { search: " João & Silva ", status: "PREPARING", sort: "number", direction: "asc", page: 2 };
  const api = createManagerApi("admin", "/api/", async (url, init) => { calls.push({ url, init }); return Response.json({}); });
  await api.orders(query); await api.order(7); await api.confirmOrder(7); await api.archiveOrder(7); await api.reports(); await api.statusCounts();
  const params = new URL(calls[0].url, "https://example.test").searchParams;
  assert.equal(params.get("search"), "João & Silva"); assert.equal(params.get("status"), "PREPARING");
  assert.equal(params.get("sort"), "number"); assert.equal(params.get("direction"), "asc"); assert.equal(params.get("page"), "2");
  assert.equal(calls[1].url, "/api/orders/7"); assert.equal(calls[2].url, "/api/orders/7/confirm");
  assert.equal(calls[2].init.method, "POST"); assert.equal(calls[2].init.body, "{}");
  assert.deepEqual(calls.slice(3).map(call => call.url), ["/api/orders/7/archive", "/api/orders/reports", "/api/orders/status-counts"]);
  assert.ok(calls.every(c => c.init.headers.Authorization === "Bearer admin"));
  const conflicts = [{ variantId: 42, productName: "Produto histórico", colorName: "Branco", size: "GG", requested: 2, available: 1 }];
  const failing = createManagerApi("admin", "/api", async () => Response.json({ error: "Estoque insuficiente", conflicts }, { status: 409 }));
  await assert.rejects(failing.confirmOrder(7), error => error.status === 409 && JSON.stringify(error.conflicts) === JSON.stringify(conflicts));
});
test("order display uses exact Decimal amounts, shared timezone and all existing statuses", () => {
  assert.equal(orderMoney("129"), "R$ 129,00"); assert.equal(orderMoney("129.9"), "R$ 129,90");
  assert.equal(orderMoney("90071992547409.91"), "R$ 90.071.992.547.409,91");
  assert.throws(() => orderMoney("NaN")); assert.throws(() => orderMoney("1.999"));
  assert.equal(orderDate("2026-11-01T02:30:00Z", true), "31/10/2026, 23:30");
  assert.equal(Object.keys(orderStatusLabels).length, 5);
  const params = new URLSearchParams(orderQueryString({ search: "", status: "", sort: "date", direction: "desc", page: 1 }));
  assert.equal(params.has("status"), false); assert.equal(params.has("search"), false);
});

test("category API uses authenticated dynamic CRUD and validates administrative list responses", async () => {
  const calls = [], category = { id: 91, name: "Acessórios", productCount: 3 };
  const api = createManagerApi("admin", "/api", async (url, init) => {
    calls.push({ url, init }); return Response.json(init.method === "GET" ? [category] : category);
  });
  assert.deepEqual(await api.categories(), [category]);
  await api.saveCategory("Acessórios"); await api.saveCategory("Novo nome", 91); await api.deleteCategory(91);
  assert.deepEqual(calls.map(c => [c.url, c.init.method]), [["/api/categorias", "GET"], ["/api/categorias", "POST"], ["/api/categorias/91", "PUT"], ["/api/categorias/91", "DELETE"]]);
  assert.ok(calls.every(c => c.init.headers.Authorization === "Bearer admin"));
  for (const invalid of [{}, [{ id: 0, name: "Invalid" }], [category, category], [{ ...category, productCount: -1 }], [{ ...category, productCount: 1.5 }]]) {
    const bad = createManagerApi("admin", "/api", async () => Response.json(invalid));
    await assert.rejects(bad.categories(), /Resposta inválida/);
  }
});
import { matchesStock, productStats, toDraft, toInput, validateDraft, normalizeHex, isLowStock, isProductOutOfStock, hasOutOfStockVariant, hasLowStockVariant, getOutOfStockVariants, getLowStockVariants, colorDraft } from "../src/app/manager/products.ts";
const color = { colorName: "Preto", colorValue: "#111111", images: [], imageUrl: "", variants: [] };
const draft = () => ({ ...toDraft(), categoryId: "1", name: "Produto teste", price: "19.90", colors: [colorDraft(color)] });

for (const threshold of [5, 10]) test(`variant low stock uses the configured boundary ${threshold}`, () => {
  const stocks = [0, 1, threshold, threshold + 1];
  const products = stocks.map(stock => ({ colors: [{ variants: [{ stock, value: "M" }] }] }));
  assert.deepEqual(stocks.map(stock => isLowStock(stock, threshold)), [false, true, true, false]);
  for (const filter of ["variante-baixo"]) assert.deepEqual(products.map(p => matchesStock(p, filter, threshold)), [false, true, true, false]);
  for (const filter of ["sem-estoque"]) assert.deepEqual(products.map(p => matchesStock(p, filter, threshold)), [true, false, false, false]);
  const stats = productStats(products, threshold);
  assert.equal(stats.lowVariants, 2);
  assert.equal(stats.stockedVariants + stats.emptyVariants, stats.variants);
  const mixed = { colors: [{ variants: [{ stock: 0 }, { stock: threshold + 1 }] }] };
  assert.equal(matchesStock(mixed, "variante-baixo", threshold), false);
  assert.equal(matchesStock(mixed, "variante-sem-estoque", threshold), true);
});
test("dashboard totals variants across colors and separates empty/low stock", () => {
  const products = [[], [0], [2, 3], [6]].map(stocks => ({ colors: stocks.map(stock => ({ variants: [{ value: "P", stock }] })) }));
  assert.deepEqual(productStats(products, 5), { products: 4, variants: 4, stockedVariants: 3, emptyVariants: 1, lowVariants: 2, empty: 1 });
});
test("each color validates name, HEX and unique integer stocks; at least one color is required", () => {
  const d = draft();
  assert.notEqual(colorDraft().key, colorDraft().key);
  assert.deepEqual(validateDraft(d), []);
  assert.ok(validateDraft({ ...d, colors: [] }).length);
  for (const invalid of [{ colorName: " " }, { colorValue: "" }, { colorValue: "#123" }, { colorValue: "red" }])
    assert.ok(validateDraft({ ...d, colors: [{ ...d.colors[0], ...invalid }] }).length);
  for (const stock of ["", "-1", "1.5", "2147483648"]) assert.ok(validateDraft({ ...d, colors: [{ ...d.colors[0], variants: [{ value: "P", stock }] }] }).length);
  assert.match(validateDraft({ ...d, colors: [{ ...d.colors[0], variants: [{ value: " P ", stock: "1" }, { value: "P", stock: "2" }] }] }).join(), /duplicada/);
  const first = { ...d.colors[0], variants: [{ value: "P", stock: "3" }] };
  assert.deepEqual(validateDraft({ ...d, colors: [first, { ...first, key: "second", colorName: "Branco" }] }), []);
});
test("draft roundtrip retains color/variant IDs, separate images and a single price/badge", () => {
  const input = { ...toInput(draft()), id: 5, badge: "Novo", colors: [
    { ...color, id: 10, colorValue: "#abcdef", imageUrl: "/black.png", images: ["/back.png"], variants: [{ id: 20, value: "P", stock: 3 }] },
    { ...color, id: 11, colorName: "Branco", colorValue: "#ffffff", imageUrl: "/white.png", variants: [{ id: 21, value: "P", stock: 0 }] }
  ] };
  const output = toInput(toDraft(input));
  assert.equal(output.colors[0].id, 10); assert.equal(output.colors[0].variants[0].id, 20);
  assert.equal(output.colors[0].colorValue, "#ABCDEF"); assert.equal(output.colors[1].colorValue, "#FFFFFF");
  assert.deepEqual(output.colors[0].images, ["/back.png"]); assert.equal(output.colors[1].imageUrl, "/white.png");
  assert.equal(output.price, 19.9); assert.equal(output.badge, "Novo");
  assert.ok(output.colors.every(c => !("price" in c) && !("badge" in c)));
});
test("manager never saves placeholder images and sends nested JWT-protected CRUD", async () => {
  const input = toInput(draft()), calls = [];
  const raw = { ...input, id: 5, category: { id: 1, name: "Camisetas" }, colors: [{ ...color, id: 10, imageUrl: null }] };
  const api = createManagerApi("verified-token", "/api/", async (url, init) => {
    calls.push({ url, init }); return new Response(JSON.stringify(init.method === "GET" ? [raw] : raw));
  });
  const [product] = await api.list();
  assert.equal(toDraft(product).colors[0].imageUrl, ""); assert.equal(toDraft(product).colors[0].images, "");
  await api.save(input); await api.save(input, 5); await api.remove(5);
  assert.deepEqual(calls.map(c => c.init.method), ["GET", "POST", "PUT", "DELETE"]);
  assert.ok(calls.every(c => c.init.headers.Authorization === "Bearer verified-token"));
  assert.deepEqual(JSON.parse(calls[2].init.body).colors[0].variants, []);
});
test("administrative API distinguishes denied access, validation and network errors", async () => {
  for (const status of [401, 403, 400, 500]) {
    const api = createManagerApi("token", "/api", async () => new Response(JSON.stringify({ error: "Falha" }), { status }));
    await assert.rejects(api.remove(1), { status });
  }
  const api = createManagerApi("token", "/api", async () => { throw new TypeError("offline"); });
  await assert.rejects(api.remove(1), { status: 0 });
});
test("HEX normalization accepts exactly six digits and preserves the color name", () => {
  for (const value of ["#1f2937", " #abcdef ", "#000000", "#FFFFFF"]) {
    const d = draft(); d.colors[0].colorValue = value;
    assert.equal(toInput(d).colors[0].colorValue, value.trim().toUpperCase());
    assert.equal(toInput(d).colors[0].colorName, "Preto");
  }
  for (const value of ["#123", "123456", "red", "#GG0000", "#12345678", "rgb(1,2,3)"]) assert.equal(normalizeHex(value), null);
});

test("variant availability counts combinations, not products, including empty colors", () => {
  const products = [[], [0, 0], [3, 0, 5, 2], [5, 4]].map(stocks => ({ colors: stocks.map(stock => ({ variants: [{ value: "M", stock }] })) }));
  const stats = productStats(products, 5);
  assert.equal(stats.variants, 8);
  assert.equal(stats.stockedVariants, 5);
  assert.equal(stats.emptyVariants, 3);
  assert.equal(stats.stockedVariants + stats.emptyVariants, stats.variants);
  assert.deepEqual(products.map(p => matchesStock(p, "variante-sem-estoque", 5)), [false, false, true, false]);
  assert.deepEqual(products.map(p => matchesStock(p, "sem-estoque", 5)), [false, true, false, false]);
  assert.equal(productStats([], 5).emptyVariants, 0);
});

test("carousel API sends an explicit selection and preserves backend limit errors", async () => {
  const raw = { ...toInput(draft()), id: 5, category: { id: 1, name: "Camisetas" }, inCarousel: true, colors: [{ ...color, id: 10 }] };
  const api = createManagerApi("verified-token", "/api", async (url, init) => {
    assert.equal(url, "/api/produtos/5/carrossel");
    assert.equal(init.method, "PATCH");
    assert.equal(init.headers.Authorization, "Bearer verified-token");
    assert.deepEqual(JSON.parse(init.body), { inCarousel: true });
    return Response.json(raw);
  });
  assert.equal((await api.setCarousel(5, true)).inCarousel, true);
  const rejected = createManagerApi("verified-token", "/api", async () => Response.json({ error: "Limite de 5 produtos no carrossel." }, { status: 409 }));
  await assert.rejects(rejected.setCarousel(6, true), { status: 409, message: "Limite de 5 produtos no carrossel." });
});

test("image upload sends authenticated multipart without forcing a boundary and returns a secure URL", async () => {
  const url = "https://res.cloudinary.com/test/image/upload/v1/products/image.png";
  const file = new File(["png"], "image.png", { type: "image/png" });
  const api = createManagerApi("token", "/api/", async (path, init) => {
    assert.equal(path, "/api/uploads/produtos"); assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { Authorization: "Bearer token" });
    assert.ok(init.body instanceof FormData); assert.equal(init.body.get("file").name, "image.png");
    return Response.json({ url });
  });
  assert.equal(await api.upload(file), url);
});

test("upload rejects invalid/large files, unsafe URLs and handles authentication/provider/network errors", async () => {
  const file = new File(["png"], "image.png", { type: "image/png" });
  const noNetwork = createManagerApi("token", "/api", async () => { assert.fail("must validate before sending"); });
  await assert.rejects(noNetwork.upload(new File(["svg"], "image.svg", { type: "image/svg+xml" })), { status: 400 });
  await assert.rejects(noNetwork.upload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })), { status: 413 });
  for (const url of ["http://res.cloudinary.com/test/image/upload/a.png", "https://evil.test/a.png", "https://res.cloudinary.com/test/image/upload/a.png?secret=x", undefined]) {
    await assert.rejects(createManagerApi("token", "/api", async () => Response.json({ url })).upload(file), { status: 0 });
  }
  for (const status of [401, 403, 400, 413, 502, 503]) {
    await assert.rejects(createManagerApi("token", "/api", async () => Response.json({ error: "Falha" }, { status })).upload(file), { status });
  }
  await assert.rejects(createManagerApi("token", "/api", async () => { throw new Error("offline"); }).upload(file), { status: 0 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createManagerApi("token", "/api", async (_path, init) => { assert.ok(init.signal.aborted); throw new DOMException("Aborted", "AbortError"); }).upload(file, controller.signal));
});

for (const [stocks, expected] of [
  [[0, 0, 0], [true, false, false]],
  [[0, 5, 10], [false, true, true]],
  [[0, 10, 20], [false, true, false]],
  [[0, 0, 10], [false, true, false]],
  [[5, 8, 12], [false, false, true]],
  [[], [false, false, false]],
]) test(`operational stock filters for ${JSON.stringify(stocks)}`, () => {
  // Each variant is in a different color: availability must span the whole product.
  const product = { colors: stocks.map(stock => ({ variants: [{ stock }] })) };
  assert.deepEqual([isProductOutOfStock(product), hasOutOfStockVariant(product), hasLowStockVariant(product, 5)], expected);
  assert.deepEqual(["sem-estoque", "variante-sem-estoque", "variante-baixo"].map(filter => matchesStock(product, filter, 5)), expected);
  assert.equal(getOutOfStockVariants(product).length, stocks.filter(stock => stock === 0).length);
  assert.equal(getLowStockVariants(product, 5).length, stocks.filter(stock => stock >= 1 && stock <= 5).length);
});
test("low stock counts individual variants even when product totals exceed threshold", () => {
  const products = [[2, 5, 10], [1, 12]].map(stocks => ({ colors: [{ variants: stocks.map(stock => ({ stock })) }] }));
  assert.equal(productStats(products, 5).lowVariants, 3);
  assert.equal(products.filter(product => matchesStock(product, "variante-baixo", 5)).length, 2);
  assert.equal(productStats([{ colors: [{ variants: [] }] }], 5).empty, 0);
});

 test("order advancement sends an expected state and displays fulfillment-specific actions", async () => {
  let call;
  const api = createManagerApi("admin", "/api", async (url, init) => { call = { url, init }; return Response.json({}); });
  await api.advanceOrder(7, "PREPARING");
  assert.equal(call.url, "/api/orders/7/advance"); assert.equal(call.init.method, "POST");
  assert.deepEqual(JSON.parse(call.init.body), { expectedStatus: "PREPARING" });
  assert.equal(orderStatusLabel("READY_OR_SHIPPED", "DELIVERY"), "Enviado");
  assert.equal(orderStatusLabel("READY_OR_SHIPPED", "PICKUP"), "Pronto para retirada");
  assert.equal(orderStatusLabel("COMPLETED", "PICKUP"), "Finalizado");
  const order = { number: "26100015", fulfillmentMethod: "DELIVERY", status: "PREPARING" };
  assert.equal(orderAction(order).label, "Marcar como enviado");
  assert.equal(orderAction({ ...order, fulfillmentMethod: "PICKUP" }).label, "Marcar como pronto para retirada");
  assert.equal(orderAction({ ...order, status: "READY_OR_SHIPPED" }).label, "Finalizar pedido");
  for (const status of ["COMPLETED", "CANCELLED"]) assert.equal(orderAction({ ...order, status }), null);
});


test("manual badge colors roundtrip, legacy defaults and empty preview never invent a badge", () => {
  const d = draft();
  assert.equal(d.badgeBackgroundColor, '#2457A7');
  assert.equal(d.badgeTextColor, '#FFFFFF');
  assert.equal(toInput(d).badge, null);
  d.badge = 'LAN?AMENTO';
  d.badgeBackgroundColor = '#abcdef'; d.badgeTextColor = '#123456';
  assert.deepEqual(validateDraft(d), []);
  const input = toInput(d);
  assert.equal(input.badgeBackgroundColor, '#ABCDEF');
  assert.equal(input.badgeTextColor, '#123456');
  assert.equal(toDraft(input).badgeBackgroundColor, '#ABCDEF');
  for (const invalid of ['red', '#fff', '#12345678', '']) {
    assert.match(validateDraft({ ...d, badgeBackgroundColor: invalid }).join(), /HEX/);
    assert.match(validateDraft({ ...d, badgeTextColor: invalid }).join(), /HEX/);
  }
});


test("manual badge limits preserve unchanged legacy drafts and allow removal", () => {
  const d = draft();
  d.badge = "123456789012";
  assert.deepEqual(validateDraft(d), []);
  d.badge = "1234567890123";
  assert.match(validateDraft(d).join(), /12 caracteres/);
  assert.deepEqual(validateDraft(d, d.badge), []);
  d.badge = "OUTRO TEXTO LONGO";
  assert.match(validateDraft(d, "1234567890123").join(), /12 caracteres/);
  d.badge = "";
  assert.deepEqual(validateDraft(d, "1234567890123"), []);
  assert.equal(toInput(d).badge, null);
});
