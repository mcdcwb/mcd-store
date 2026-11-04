import { prisma } from "../../src/lib/prisma.js";
export const fixtureCategory = () => prisma.category.upsert({ where: { normalizedName: "camisetas" }, create: { name: "camisetas", normalizedName: "camisetas" }, update: {} });
export const categoryRelation = { connectOrCreate: { where: { normalizedName: "camisetas" }, create: { name: "camisetas", normalizedName: "camisetas" } } };
