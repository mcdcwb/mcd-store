import "./helpers/assert-isolated-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { ensureInitialCarouselSelection } from "../src/services/product.service.js";
import { categoryRelation } from "./helpers/category.js";

let previousProducts: { id: number; isPublished: boolean; inCarousel: boolean }[] = [];

before(async () => {
    previousProducts = await prisma.product.findMany({ select: { id: true, isPublished: true, inCarousel: true } });
    await prisma.product.updateMany({ data: { isPublished: false, inCarousel: false } });
});

after(async () => {
    for (const product of previousProducts) {
        await prisma.product.update({ where: { id: product.id }, data: { isPublished: product.isPublished, inCarousel: product.inCarousel } });
    }
    await prisma.$disconnect();
});

async function withProducts<T>(run: (prefix: string) => Promise<T>): Promise<T> {
    const prefix = `Carousel initialization ${randomUUID()} `;
    try {
        return await run(prefix);
    } finally {
        await prisma.product.deleteMany({ where: { name: { startsWith: prefix } } });
    }
}

async function createProducts(prefix: string, published: boolean[], selected: number[] = []) {
    const products = [];
    for (const [index, isPublished] of published.entries()) {
        products.push(await prisma.product.create({
            data: {
                name: `${prefix}${index}`,
                price: 20,
                public: "unissex",
                category: categoryRelation,
                isPublished,
                inCarousel: selected.includes(index)
            }
        }));
    }
    return products;
}

test("an empty database remains unselected", async t => {
    if (await prisma.product.count() !== 0) {
        t.skip("This case requires the fresh isolated database used by the runner.");
        return;
    }
    assert.equal(await ensureInitialCarouselSelection(), 0);
    assert.equal(await prisma.product.count({ where: { inCarousel: true } }), 0);
});

test("no published products are selected when only drafts exist", async () => withProducts(async prefix => {
    await createProducts(prefix, [false, false]);
    assert.equal(await ensureInitialCarouselSelection(), 0);
    assert.equal(await prisma.product.count({ where: { name: { startsWith: prefix }, inCarousel: true } }), 0);
}));

test("selects two published products once and preserves the selection on later initialization", async () => withProducts(async prefix => {
    const products = await createProducts(prefix, [true, true, true, true, false]);
    assert.equal(await ensureInitialCarouselSelection(), 2);
    const selected = await prisma.product.findMany({ where: { name: { startsWith: prefix }, inCarousel: true }, orderBy: { id: "asc" } });
    assert.equal(selected.length, 2);
    assert.ok(selected.every(product => product.isPublished));
    assert.ok(selected.every(product => products.slice(0, 4).some(candidate => candidate.id === product.id)));
    assert.equal(await ensureInitialCarouselSelection(), 0);
    assert.deepEqual(
        (await prisma.product.findMany({ where: { name: { startsWith: prefix }, inCarousel: true }, orderBy: { id: "asc" } })).map(product => product.id),
        selected.map(product => product.id)
    );
}));

test("preserves an existing selection without drawing additional products", async () => withProducts(async prefix => {
    const products = await createProducts(prefix, [true, true, true], [1]);
    assert.equal(await ensureInitialCarouselSelection(), 0);
    const selected = await prisma.product.findMany({ where: { name: { startsWith: prefix }, inCarousel: true } });
    assert.deepEqual(selected.map(product => product.id), [products[1]!.id]);
}));

test("selects the only published product when fewer than two are available", async () => withProducts(async prefix => {
    const [product] = await createProducts(prefix, [true]);
    assert.equal(await ensureInitialCarouselSelection(), 1);
    assert.equal(await prisma.product.count({ where: { name: { startsWith: prefix }, isPublished: true, inCarousel: true } }), 1);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product!.id } })).inCarousel, true);
}));

test("concurrent initializations produce one consistent selection", async () => withProducts(async prefix => {
    await createProducts(prefix, [true, true, true, true]);
    const initialized = await Promise.all([ensureInitialCarouselSelection(), ensureInitialCarouselSelection()]);
    assert.equal(initialized.reduce((sum, count) => sum + count, 0), 2);
    assert.equal(await prisma.product.count({ where: { name: { startsWith: prefix }, inCarousel: true } }), 2);
}));
