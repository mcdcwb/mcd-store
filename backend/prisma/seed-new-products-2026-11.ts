// Cadastra 7 produtos novos do catálogo (proposta de nov/2026). Idempotente:
// - produto que já existe com o mesmo nome é pulado (não duplica nem altera);
// - cada foto vai para o Cloudinary (pasta mcd-store/products) com public_id fixo, então rodar de novo reaproveita a URL.
// As fotos NÃO ficam no repositório: informe a pasta em PHOTOS_DIR.
// Uso (a partir de backend/): PHOTOS_DIR="C:\...\mcd-store-fotos-novas" npx tsx prisma/seed-new-products-2026-11.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma.ts";
import { getCloudinary } from "../src/config/cloudinary.ts";
import { PRODUCT_IMAGE_FOLDER } from "../src/services/upload.service.ts";

type Color = { name: string; value: string; photos: string[]; stock: Record<string, number> };
type NewProduct = { name: string; description: string; price: string; public: string; category: string; colors: Color[] };

// Estoque com variantes de 1 unidade ("ÚLTIMA PEÇA"), 2–3 ("POUCAS UNIDADES") e algumas esgotadas (0).
const PRODUCTS: NewProduct[] = [
  { name: "Camiseta Oversized Street", description: "Malha 100% algodão fio 30, modelagem ampla e ombro caído.", price: "79.90", public: "unissex", category: "Camisetas", colors: [
    { name: "Preto", value: "#171717", photos: ["camiseta-oversized-street-preto (1).jpg", "camiseta-oversized-street-preto (2).jpg"], stock: { P: 6, M: 8, G: 5, GG: 3, XG: 1 } },
    { name: "Branco", value: "#F5F5F0", photos: ["camiseta-oversized-street-branco (1).jpg", "camiseta-oversized-street-branco (2).jpg"], stock: { P: 4, M: 0, G: 6, GG: 2, XG: 0 } },
  ] },
  { name: "Camiseta Baby Look Canelada", description: "Malha canelada com elastano, ajustada ao corpo e com gola redonda.", price: "59.90", public: "feminino", category: "Camisetas", colors: [
    { name: "Rosa", value: "#D88FA6", photos: ["camiseta-baby-look-canelada-rosa.jpg"], stock: { P: 5, M: 3, G: 1, GG: 0 } },
  ] },
  { name: "Bermuda Cargo Trilha", description: "Sarja com bolsos cargo laterais, cós com passantes e barra italiana.", price: "139.90", public: "masculino", category: "Bermudas", colors: [
    { name: "Oliva", value: "#61684A", photos: ["bermuda-cargo-trilha-oliva.jpg"], stock: { P: 3, M: 7, G: 5, GG: 1 } },
  ] },
  { name: "Calça Wide Leg Fluida", description: "Tecido fluido de viscose, cintura alta com elástico nas costas e pernas amplas.", price: "199.90", public: "feminino", category: "Calças", colors: [
    { name: "Preto", value: "#171717", photos: ["calca-wide-leg-fluida-preto.jpg"], stock: { P: 4, M: 6, G: 3, GG: 1 } },
    { name: "Areia", value: "#C4AF8C", photos: ["calca-wide-leg-fluida-bege.webp", "calca-wide-leg-fluida-bege(1).webp"], stock: { P: 0, M: 2, G: 5, GG: 2 } },
  ] },
  { name: "Calça Moletom Kids", description: "Moletom flanelado com cós elástico e joelhos reforçados.", price: "79.90", public: "infantil", category: "Calças", colors: [
    { name: "Cinza", value: "#888888", photos: ["calca-moletom-infantil-cinza.webp"], stock: { 4: 5, 6: 3, 8: 4, 10: 1 } },
  ] },
  { name: "Tênis Runner Leve", description: "Cabedal em tela respirável, entressola macia e solado antiderrapante.", price: "299.90", public: "unissex", category: "Calçados", colors: [
    { name: "Preto", value: "#171717", photos: ["tenis-runner-preto.webp", "tenis-runner-preto(1).webp"], stock: { 36: 1, 37: 3, 38: 6, 39: 4, 40: 2 } },
  ] },
  { name: "Vestido Chemise Linho", description: "Linho com botões frontais, faixa na cintura e mangas dobráveis.", price: "249.90", public: "feminino", category: "Vestidos", colors: [
    { name: "Bege", value: "#DDD2B9", photos: ["vestido-chemise-linho-bege.webp", "vestido-chemise-linho-bege(1).webp"], stock: { P: 2, M: 4, G: 3, GG: 0 } },
  ] },
];

const slug = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function upload(file: string, publicId: string) {
  const result = await getCloudinary().uploader.upload(file, { folder: PRODUCT_IMAGE_FOLDER, public_id: publicId, overwrite: false, resource_type: "image" });
  return result.secure_url;
}

async function main() {
  const dir = process.env.PHOTOS_DIR;
  if (!dir) throw new Error("Informe a pasta das fotos em PHOTOS_DIR.");
  const missing = PRODUCTS.flatMap(p => p.colors.flatMap(c => c.photos)).filter(photo => !existsSync(join(dir, photo)));
  if (missing.length) throw new Error(`Fotos ausentes em ${dir}: ${missing.join(", ")}`);
  for (const product of PRODUCTS) {
    if (await prisma.product.findFirst({ where: { name: product.name }, select: { id: true } })) { console.log(`= já existe: ${product.name}`); continue; }
    const category = await prisma.category.findFirst({ where: { name: product.category }, select: { id: true } });
    if (!category) throw new Error(`Categoria inexistente: ${product.category}`);
    const colors = [];
    for (const [position, color] of product.colors.entries()) {
      const images = [];
      for (const [index, photo] of color.photos.entries()) images.push(await upload(join(dir, photo), `${slug(product.name)}-${slug(color.name)}-${index + 1}`));
      colors.push({ colorName: color.name, colorValue: color.value, imageUrl: images[0], images, position,
        variants: { create: Object.entries(color.stock).map(([value, stock]) => ({ value, stock })) } });
    }
    await prisma.product.create({ data: { name: product.name, description: product.description, price: product.price, public: product.public, categoryId: category.id, colors: { create: colors } } });
    console.log(`+ criado: ${product.name}`);
  }
}

main().finally(() => prisma.$disconnect());
