import assert from "node:assert/strict";
import test from "node:test";
import { stockBadge } from "../backend/src/lib/stock-badges.ts";
import { relatedProducts } from "../src/app/lib/related-products.ts";

test("related products prioritize category then audience, exclude private/self, deduplicate and remain stable", () => {
  const make = (id, category = "calcas", audience = "feminino", isPublished = true) => ({ id, category, public: audience, isPublished });
  const current = make(10, "camisetas", "masculino");
  const catalog = [make(1), make(2, "calcas", "masculino"), make(5, "camisetas"), make(3, "camisetas"), make(3, "camisetas"), current, make(4, "camisetas", "masculino", false)];
  assert.deepEqual(relatedProducts(current, catalog).map(p => p.id), [3, 5, 2]);
  assert.deepEqual(relatedProducts(current, [...catalog].reverse()).map(p => p.id), [3, 5, 2]);
  assert.equal(catalog.length, 7);
});

test("related products use public fallback and handle sparse or empty catalogs", () => {
  const current = { id: 1, categoryId: 10, category: "Camisas", public: "masculino", isPublished: true };
  const fallback = { ...current, id: 2, categoryId: 11, category: "Calças", public: "feminino" };
  assert.deepEqual(relatedProducts(current, [current, fallback]), [fallback]);
  assert.deepEqual(relatedProducts(current, [current, { ...fallback, isPublished: false }]), []);
});

test("public stock badge uses all adapted colors, preserves manual badge and ignores selected color", () => {
  const product = adaptNested({ id: 1, name: "Multicolor", price: 20, public: "unissex", category: "camisetas", badge: "NOVO",
    colors: [0, 1].map((stock, i) => ({ id: i + 1, colorName: `Cor ${i}`, colorValue: "#111111", images: [], variants: [{ id: i + 1, value: "M", stock }] })) });
  const settings = { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true };
  assert.equal(stockBadge(product, settings), "last-unit");
  assert.equal(stockBadge(selectProductColor(product, 2), settings), "last-unit");
  assert.equal(product.badge, "NOVO");
  product.colors[0].variants[0].stock = 10;
  assert.equal(stockBadge(product, settings), "last-unit");
  product.colors[1].variants[0].stock = 3;
  assert.equal(stockBadge(product, settings), "low-stock");
  product.colors[1].variants[0].stock = 8;
  assert.equal(stockBadge(product, settings), null);
  assert.equal(product.badge, "NOVO");
});
import { sortCatalog, toggleCatalogSort } from "../src/app/lib/catalog-sort.ts";

test("catalog sorting is opt-in, numeric, pt-BR, stable and immutable", () => {
  const products = Object.freeze([
    Object.freeze({ name: "Zebra", price: 100 }),
    Object.freeze({ name: "álgebra", price: 50 }),
    Object.freeze({ name: "Algebra", price: 500 }),
    Object.freeze({ name: "Bota", price: 100 }),
  ]);
  assert.deepEqual(sortCatalog(products, null), products);
  assert.deepEqual(sortCatalog(products, { field: "name", direction: "asc" }).map(p => p.name), ["álgebra", "Algebra", "Bota", "Zebra"]);
  assert.deepEqual(sortCatalog(products, { field: "name", direction: "desc" }).map(p => p.name), ["Zebra", "Bota", "álgebra", "Algebra"]);
  assert.deepEqual(sortCatalog(products, { field: "price", direction: "asc" }).map(p => p.price), [50, 100, 100, 500]);
  assert.deepEqual(sortCatalog(products, { field: "price", direction: "desc" }).map(p => p.name), ["Algebra", "Zebra", "Bota", "álgebra"]);
  assert.deepEqual(products.map(p => p.name), ["Zebra", "álgebra", "Algebra", "Bota"]);
});

test("one sort criterion toggles direction and changing criterion starts ascending", () => {
  let sort = null;
  for (const [field, direction] of [["name", "asc"], ["name", "desc"], ["name", "asc"], ["price", "asc"], ["price", "desc"], ["name", "asc"]]) {
    sort = toggleCatalogSort(sort, field);
    assert.deepEqual(sort, { field, direction });
  }
});
import { adaptProduct as adaptNested, selectProductColor, catalogCategories, catalogSizes, stockFor, productImagePlaceholder } from "../src/app/lib/products.ts";

test("dynamic category IDs support arbitrary names, publication, exhaustion and restock", () => {
  const make = (id, name, stock, isPublished = true) => adaptNested({ id, name: "Dynamic product", price: 10, public: "unissex", categoryId: id,
    category: { id, name }, isPublished, colors: [{ id, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id, value: "P", stock }] }] });
  const stocked = make(77, "Acessórios", 2);
  assert.deepEqual(catalogCategories([stocked, make(78, "Hidden", 5, false), make(79, "Empty", 0)]), [{ value: "77", label: "Acessórios" }]);
  assert.deepEqual(catalogCategories([make(77, "Acessórios", 0)]), []);
  assert.deepEqual(catalogCategories([make(77, "Nome novo", 1)]), [{ value: "77", label: "Nome novo" }]);
});

const adaptProduct = ({ images, imageUrl, colorName, colorValue, variants, ...product } = {}) => adaptNested({ ...product,
  colors: [{ id: 10, images, imageUrl, colorName: colorName ?? "Cor não informada", colorValue: colorValue ?? "#000000", variants: variants?.map((v, i) => ({ id: i + 1, ...v })) }] });

const input = {
  id: 1, name: "Produto real", price: "129.90", public: "unissex", category: "camisetas",
  description: null, images: [], imageUrl: null, colorName: null, colorValue: null, badge: null,
  variants: [{ value: "P", stock: 0 }, { value: "39", stock: 2 }, { value: "Sob medida", stock: 1 }]
};

test("adapter converts Prisma Decimal and nullable fields without inventing stock", () => {
  const product = adaptProduct(input);
  assert.equal(product.price, 129.9);
  assert.equal(product.public, "unissex");
  assert.equal(product.category, "camisetas");
  assert.deepEqual(product.sizes, ["P", "39", "Sob medida"]);
  assert.equal(stockFor(product, "P"), 0);
  assert.equal(stockFor(product, "39"), 2);
  assert.equal(stockFor(product, "missing"), 0);
  assert.equal(product.imageUrl, productImagePlaceholder);
  assert.deepEqual(product.images, [productImagePlaceholder]);
});

test("adapter keeps image order, removes duplicates and maps color and description", () => {
  const product = adaptProduct({ ...input, imageUrl: "/front.jpg", images: ["/back.jpg", "/front.jpg", ""],
    colorName: "Azul", colorValue: "#123456", description: "Algodão", badge: "Novo" });
  assert.deepEqual(product.images, ["/front.jpg", "/back.jpg"]);
  assert.deepEqual(product.color, { name: "Azul", value: "#123456" });
  assert.equal(product.description, "Algodão");
  assert.equal(product.badge, "Novo");
});

test("invalid prices, response shapes and variant stocks are rejected", () => {
  for (const price of [null, "", "abc", -1, 0, Infinity]) assert.throws(() => adaptProduct({ ...input, price }));
  for (const stock of [-1, 0.5, "3", null]) {
    assert.throws(() => adaptProduct({ ...input, variants: [{ value: "P", stock }] }));
  }
  assert.throws(() => adaptProduct({ ...input, variants: [{ value: "P", stock: 1 }, { value: "P", stock: 2 }] }));
  assert.throws(() => adaptProduct({ ...input, images: null }));
  assert.throws(() => adaptProduct(null));
});

test("size options are derived from variants and sort numbers naturally", () => {
  const product = adaptProduct({ ...input, variants: ["40", "M", "P", "8", "38", "Único"].map(value => ({ value, stock: 1 })) });
  assert.deepEqual(catalogSizes([product, product]), ["P", "M", "Único", "8", "38", "40"]);
  assert.deepEqual(catalogSizes([]), []);
});

test("catalog sizes exclude sold-out variants, deduplicate and retain unknown sizes before numbers", () => {
  const product = adaptProduct({ ...input, variants: ["10", "9", "8", "GG", "XG", "PP", "P", "M", "G", "Sob medida", "A2"].map(value => ({ value, stock: 1 })) });
  const soldOut = adaptProduct({ ...input, variants: [{ value: "36", stock: 0 }] });
  assert.deepEqual(catalogSizes([product, product, soldOut]), ["PP", "P", "M", "G", "GG", "XG", "A2", "Sob medida", "8", "9", "10"]);
  assert.deepEqual(catalogSizes([soldOut]), []);
});

test("color projections isolate images and stock while filters span all positive variants", () => {
  const base = adaptProduct(input);
  const product = adaptNested({ ...input, colors: [
    { id: 10, colorName: "Preto", colorValue: "#111111", images: ["/black.jpg"], variants: [{ id: 1, value: "P", stock: 3 }, { id: 2, value: "GG", stock: 0 }] },
    { id: 11, colorName: "Branco", colorValue: "#FFFFFF", images: ["/white.jpg"], variants: [{ id: 3, value: "P", stock: 0 }, { id: 4, value: "GG", stock: 1 }] }
  ] });
  const white = selectProductColor(product, 11);
  assert.equal(stockFor(product, "P"), 3); assert.equal(stockFor(white, "P"), 0); assert.equal(stockFor(white, "GG"), 1);
  assert.equal(white.imageUrl, "/white.jpg"); assert.equal(product.imageUrl, "/black.jpg");
  assert.equal(white.price, product.price); assert.deepEqual(catalogSizes([product]), ["P", "GG"]);
  assert.throws(() => selectProductColor(product, 999));
  assert.throws(() => adaptNested({ ...input, colors: [] }));
});

test("category options use only the supplied catalog, positive stock and the configured order", () => {
  const options = ["jaquetas", "camisetas", "calcas", "calcados", "vestidos"].map(value => ({ value, label: value }));
  const shirt = adaptProduct({ ...input, category: "camisetas", variants: [{ value: "P", stock: 1 }] });
  const jacket = { ...shirt, id: 2, category: "jaquetas" };
  const soldOut = adaptProduct({ ...input, category: "calcados", variants: [{ value: "39", stock: 0 }] });
  const noVariants = adaptProduct({ ...input, category: "calcas", variants: [] });
  // There is no publication flag in this model. Records not returned by the
  // public catalog must not contribute options, even if stored elsewhere.
  const outsideCatalog = { ...shirt, id: 3, category: "vestidos" };
  const catalog = [shirt, soldOut, noVariants, jacket, shirt];
  assert.deepEqual(catalogCategories(catalog, options).map(o => o.value), ["jaquetas", "camisetas"]);
  assert.equal(catalogCategories(catalog, options).some(o => o.value === outsideCatalog.category), false);
  assert.deepEqual(catalogCategories([], options), []);
  assert.equal(options.length, 5);
});

test("category availability spans every color and reacts to replacement stock/catalog data", () => {
  const product = adaptNested({ ...input, category: "calcas", colors: [
    { id: 10, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 1, value: "P", stock: 0 }] },
    { id: 11, colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: [{ id: 2, value: "GG", stock: 1 }] }
  ] });
  const options = [{ value: "calcas", label: "Calças" }];
  assert.deepEqual(catalogCategories([product], options), options);
  assert.deepEqual(catalogCategories([selectProductColor(product, 10)], options), options);
  const soldOut = { ...product, colors: product.colors.map(c => ({ ...c, variants: c.variants.map(v => ({ ...v, stock: 0 })) })) };
  assert.deepEqual(catalogCategories([soldOut], options), []);
  assert.deepEqual(catalogCategories([], options), []);
  assert.deepEqual(catalogCategories([product], options), options);
});

import { selectedStockBadge } from "../src/app/lib/selected-stock-badge.ts";
test("selected badges require explicit dimensions and preserve stock toggles", () => {
  const settings = { lowStockThreshold: 5, showLastUnitBadge: true, showLowStockBadge: true };
  const product = { colors: [
    { id: 1, colorName: "Black", variants: [{ value: "P", stock: 1 }, { value: "M", stock: 5 }, { value: "G", stock: 8 }, { value: "X", stock: 0 }] },
    { id: 2, colorName: "White", variants: [{ value: "P", stock: 3 }] }
  ] };
  for (const selection of [{}, { colorId: 1 }, { size: "P" }, { sizes: ["P"] }, { colorId: 99, size: "P" }, { colorId: 1, size: "missing" }, { colorId: 1, size: "X" }, { colorId: 1, size: "G" }]) {
    assert.equal(selectedStockBadge(product, settings, selection), null);
  }
  assert.equal(selectedStockBadge(product, settings, { colorId: 1, size: "P" }), "last-unit");
  assert.equal(selectedStockBadge(product, settings, { colorId: 1, size: "M" }), "low-stock");
  assert.equal(selectedStockBadge(product, settings, { colorId: 2, size: "P" }), "low-stock");
  assert.equal(selectedStockBadge(product, { ...settings, showLastUnitBadge: false }, { colorId: 1, size: "P" }), "low-stock");
  assert.equal(selectedStockBadge(product, { ...settings, showLowStockBadge: false }, { colorId: 1, size: "M" }), null);
  assert.equal(selectedStockBadge({ colors: [{ variants: [{ value: "P", stock: 1 }] }] }, settings, { size: "P" }), "last-unit");
  assert.equal(selectedStockBadge({ colors: [{ id: 10, colorName: "Preto", variants: [{ value: "P", stock: 1 }] }] }, settings, { size: "P" }), "last-unit");
  assert.equal(selectedStockBadge({ colors: [{ id: 10, colorName: "Preto", variants: [{ value: "P", stock: 1 }] }] }, settings, { colorId: 99, size: "P" }), null);
  assert.equal(selectedStockBadge({ colors: [{ id: 1, colorName: "Black", variants: [{ stock: 1 }] }] }, settings, { colorId: 1 }), "last-unit");
  assert.equal(selectedStockBadge({ colors: [{ variants: [{ stock: 1 }] }] }, settings), null);
});
