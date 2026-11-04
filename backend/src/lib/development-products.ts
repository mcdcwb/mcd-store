import { prisma } from "./prisma.js";
import { lockCarouselSelection } from "./carousel-lock.js";
import { createProductSchema } from "../schemas/product.schema.js";
import { z } from "zod";
import { normalizeCategoryName } from "../schemas/category.schema.js";

// Reserved ownership marker: only records created by this seed are replaced.
export const seedMarker = "[mcd-store:dev-seed:v1] ";
export const seedWhere = { description: { startsWith: seedMarker } };

const catalog = [
    { name: "Camiseta Essential Oversized", category: "camisetas", public: "unissex", price: 129.9, colorName: "Preto", colorValue: "#171717", description: "Malha de algodão encorpada, corte amplo e gola canelada.", badge: "Mais vendido" },
    { name: "Camiseta Aventura", category: "camisetas", public: "infantil", price: 59.9, colorName: "Amarelo", colorValue: "#E8BA45", description: "Algodão macio e modelagem confortável para brincar todos os dias." },
    { name: "Jaqueta Sarja Urbana", category: "jaquetas", public: "masculino", price: 289.9, colorName: "Oliva", colorValue: "#61684A", description: "Sarja resistente com bolsos frontais e fechamento por botões." },
    { name: "Jaqueta Jeans Cropped", category: "jaquetas", public: "feminino", price: 249.9, colorName: "Azul denim", colorValue: "#557A99", description: "Jeans de lavagem média, comprimento curto e mangas ajustáveis.", badge: "Novo" },
    { name: "Calça Chino Confort", category: "calcas", public: "masculino", price: 189.9, colorName: "Areia", colorValue: "#C4AF8C", description: "Sarja com elastano, corte reto e bolsos discretos para o dia a dia." },
    { name: "Calça Jogger Moletom", category: "calcas", public: "unissex", price: 169.9, colorName: "Cinza", colorValue: "#888888", description: "Moletom felpado com cós elástico, cordão e punhos nas barras." },
    { name: "Bermuda Linho Verão", category: "bermudas", public: "masculino", price: 149.9, colorName: "Natural", colorValue: "#DDD2B9", description: "Mistura de linho e viscose com toque leve e comprimento acima do joelho.", badge: "Destaque" },
    { name: "Bermuda Passeio", category: "bermudas", public: "infantil", price: 69.9, colorName: "Azul marinho", colorValue: "#253754", description: "Sarja leve com cintura ajustável e bolsos para pequenos tesouros." },
    { name: "Vestido Midi Aurora", category: "vestidos", public: "feminino", price: 229.9, colorName: "Terracota", colorValue: "#AF624D", description: "Viscose fluida, alças largas e cintura marcada com faixa removível.", badge: "Novo" },
    { name: "Vestido Jardim", category: "vestidos", public: "infantil", price: 99.9, colorName: "Rosa", colorValue: "#D88FA6", description: "Vestido de algodão com saia rodada e fechamento nas costas." },
    { name: "Tênis Casual Horizonte", category: "calcados", public: "unissex", price: 259.9, colorName: "Branco", colorValue: "#F5F5F0", description: "Cabedal em lona, palmilha acolchoada e solado de borracha flexível." },
    { name: "Sandália Tiras Serena", category: "calcados", public: "feminino", price: 179.9, colorName: "Caramelo", colorValue: "#A66C3F", description: "Tiras com ajuste por fivela e salto baixo para caminhar com conforto.", badge: "Destaque" }
];

export const developmentProducts = catalog.map((product, index) => {
    const sizes = product.category === "calcados"
        ? ["36", "37", "38", "39", "40"]
        : product.public === "infantil" ? ["4", "6", "8", "10"] : ["P", "M", "G", "GG"];
    const images = ["Frente", "Costas"].map(view =>
        `https://placehold.co/800x1000/${product.colorValue.slice(1)}/222222?text=${encodeURIComponent(product.name + " - " + view)}`
    );
    return createProductSchema.omit({ categoryId: true }).extend({ category: z.string() }).parse({
        name: product.name, price: product.price, public: product.public, category: product.category,
        description: seedMarker + product.description,
        badge: product.badge ?? null,
        colors: [{
            colorName: product.colorName, colorValue: product.colorValue, imageUrl: images[0],
            images,
            variants: sizes.map((value, sizeIndex) => ({ value, stock: (index + sizeIndex * 3) % 13 }))
        }]
    });
});

export async function seedDevelopmentProducts() {
    return prisma.$transaction(async tx => {
        await lockCarouselSelection(tx);
        const selectedSeedNames = new Set((await tx.product.findMany({
            where: { ...seedWhere, inCarousel: true },
            select: { name: true }
        })).map(product => product.name));
        // Cascade removes only variants belonging to these explicitly marked products.
        await tx.product.deleteMany({ where: seedWhere });
        for (const { colors, category: name, ...product } of developmentProducts) {
            const category = await tx.category.upsert({ where: { normalizedName: normalizeCategoryName(name) }, create: { name, normalizedName: normalizeCategoryName(name) }, update: {} });
            await tx.product.create({ data: { ...product, categoryId: category.id, inCarousel: selectedSeedNames.has(product.name), colors: { create: colors.map(({ variants, ...color }, position) => ({ ...color, position, variants: { create: variants } })) } } });
        }
        return tx.product.findMany({ where: seedWhere, include: { category: { select: { id: true, name: true } }, colors: { include: { variants: true } } } });
    });
}
