import assert from "node:assert/strict";
import test from "node:test";
import { fetchProducts, fetchCarouselProducts, catalogSizes, catalogCategories } from "../src/app/lib/products.ts";

const product = (id, isPublished, inCarousel) => ({ id, name: `Product ${id}`, price: "30.00", public: "unissex", category: { id, name: `Category ${id}` }, isPublished, inCarousel,
  colors: [{ id: id + 10, colorName: "Roxo", colorValue: "#800080", images: [], variants: [{ id: id + 20, value: id === 1 ? "M" : "XGG", stock: 1 }] }] });

test("catalog and carousel request separate endpoints and keep publication independent of slide selection", async t => {
  const data = [product(1, true, true), product(2, false, true), product(3, false, false)];
  const urls = [];
  t.mock.method(globalThis, "fetch", async url => { urls.push(url); return new Response(JSON.stringify(data)); });
  const catalog = await fetchProducts("/api/"), carousel = await fetchCarouselProducts("/api/");
  assert.deepEqual(urls, ["/api/produtos", "/api/produtos/carrossel"]);
  assert.deepEqual(catalog.map(p => p.id), [1]);
  assert.deepEqual(carousel.map(p => p.id), [1, 2]);
  assert.deepEqual(catalogSizes(carousel), ["M"]);
  assert.deepEqual(catalogCategories(carousel).map(c => c.value), ["1"]);
});

test("carousel errors and malformed data never become an unfiltered catalog fallback", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 503 }));
  await assert.rejects(fetchCarouselProducts());
  mock.mock.mockImplementation(async () => new Response("{}"));
  await assert.rejects(fetchCarouselProducts());
});
