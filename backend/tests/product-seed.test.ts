import assert from "node:assert/strict";
import test from "node:test";
import { developmentProducts, seedMarker } from "../src/lib/development-products.js";

test("development catalog covers categories, audiences and appropriate variants", () => {
    assert.equal(developmentProducts.length, 12);
    assert.equal(developmentProducts.reduce((sum, product) => sum + product.colors[0].variants.length, 0), 50);
    for (const category of ["camisetas", "jaquetas", "calcas", "bermudas", "vestidos", "calcados"]) {
        assert.equal(developmentProducts.filter(product => product.category === category).length, 2);
    }
    for (const audience of ["masculino", "feminino", "unissex", "infantil"]) {
        assert.equal(developmentProducts.filter(product => product.public === audience).length, 3);
    }
    for (const product of developmentProducts) {
        assert.ok(product.description?.startsWith(seedMarker));
        assert.equal(new Set(product.colors[0].variants.map(variant => variant.value)).size, product.colors[0].variants.length);
        assert.ok(product.colors[0].variants.every(variant => Number.isInteger(variant.stock) && variant.stock >= 0));
        if (product.category === "calcados") {
            assert.deepEqual(product.colors[0].variants.map(variant => variant.value), ["36", "37", "38", "39", "40"]);
        }
        assert.ok(product.colors[0].images.length >= 2);
        assert.equal(product.colors[0].imageUrl, product.colors[0].images[0]);
        for (const image of product.colors[0].images) assert.equal(new URL(image).protocol, "https:");
    }
});
