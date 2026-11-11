import "./helpers/assert-isolated-database.js";
import { categoryRelation } from "./helpers/category.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdmin } from "../src/services/admin.service.js";
import { startTestServer } from "./helpers/http.js";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

// Sem orderBy, o Postgres devolve a ordem física das linhas, que muda a cada UPDATE. As listas de
// produtos (painel e catálogo) precisam manter a ordem de criação (id) depois de edições.
test("listas de produtos mantêm a ordem por id depois de atualizações", async () => {
    const server = await startTestServer(createApp());
    const prefix = `Ordem ${randomUUID()}`, email = `admin-${randomUUID()}@example.test`, password = "OrdemA1-" + randomUUID();
    const ids: number[] = [];
    try {
        await createAdmin({ email, password });
        const token = (await (await server.request("/auth/login", "POST", { email, password })).json()).accessToken as string;
        for (const n of [0, 1, 2, 3]) {
            const product = await prisma.product.create({ data: { name: `${prefix} ${n}`, price: 10, public: "unissex", category: categoryRelation,
                colors: { create: { colorName: "Preto", colorValue: "#111111", images: [], variants: { create: [{ value: "M", stock: 5 }] } } } } });
            ids.push(product.id);
        }
        // Atualiza os primeiros (move as linhas no armazenamento do Postgres) várias vezes.
        for (let round = 0; round < 3; round++)
            for (const id of [ids[0], ids[2], ids[1]]) await prisma.product.update({ where: { id }, data: { price: { increment: 1 } } });
        const ours = (list: { id: number }[]) => list.map(p => p.id).filter(id => ids.includes(id));
        const admin = await (await server.request("/produtos/admin", "GET", undefined, token)).json();
        const store = await (await server.request("/produtos")).json();
        assert.deepEqual(ours(admin), ids, "painel em ordem de criação");
        assert.deepEqual(ours(store), ids, "catálogo em ordem de criação");
        const all = (admin as { id: number }[]).map(p => p.id);
        assert.deepEqual(all, [...all].sort((a, b) => a - b), "lista inteira do painel ordenada por id");
    } finally {
        await prisma.product.deleteMany({ where: { id: { in: ids } } });
        await prisma.admin.deleteMany({ where: { email } });
        await server.close();
        await prisma.$disconnect();
    }
});
