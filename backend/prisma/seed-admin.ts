// Garante que exista um administrador (idempotente).
//
// Uso local:  DATABASE_URL=<postgres local mcd_store_demo> npm run seed:admin
//
// - E-mail e senha vêm de ADMIN_EMAIL / ADMIN_PASSWORD. Se não estiverem no ambiente do
//   terminal, são lidas do backend/.env — SÓ essas duas chaves; o DATABASE_URL nunca é lido
//   de arquivo (vem sempre do ambiente, com as travas de src/lib/prisma.ts).
// - Se já existir QUALQUER administrador: não cria nem altera nada; só lista e-mail e data.
// - Se existir um cliente comum com o mesmo e-mail: não promove; avisa e encerra.
// - A senha é gravada pelo mesmo createAdmin() do sistema (argon2id via lib/password.ts).
// - Banco remoto (Neon) só com NODE_ENV=production, MCD_DEMO_ALLOW_REMOTE_DATABASE=1 e
//   ALLOW_DEMO_ADMIN_BOOTSTRAP=1.
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  const fileValues = parse(readFileSync(envFile));
  for (const key of ["ADMIN_EMAIL", "ADMIN_PASSWORD"] as const) {
    if (!process.env[key] && fileValues[key]) process.env[key] = fileValues[key];
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Defina DATABASE_URL no ambiente do terminal (ele não é lido do .env).");
const url = new URL(databaseUrl);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
if (!isLocal && process.env.ALLOW_DEMO_ADMIN_BOOTSTRAP !== "1")
  throw new Error("Banco remoto: defina ALLOW_DEMO_ADMIN_BOOTSTRAP=1 para autorizar explicitamente.");

const { createAdminSchema } = await import("../src/schemas/admin.schema.js");
const { passwordRequirementsText } = await import("../src/schemas/password.schema.js");
const { createAdmin } = await import("../src/services/admin.service.js");
const { prisma } = await import("../src/lib/prisma.js"); // recusa bancos fora dos autorizados

try {
  const [{ name: database }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  console.log(`Banco: ${database} (${isLocal ? "local" : "remoto"})`);

  const admins = await prisma.admin.findMany({ select: { email: true, createdAt: true, active: true }, orderBy: { createdAt: "asc" } });
  if (admins.length) {
    console.log(`Já existe(m) ${admins.length} administrador(es). Nada foi criado nem alterado:`);
    for (const admin of admins) console.log(`  - ${admin.email} · criado em ${admin.createdAt.toISOString()}${admin.active ? "" : " · INATIVO"}`);
    process.exit(0);
  }

  const input = createAdminSchema.safeParse({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  if (!input.success) {
    console.error(`Defina ADMIN_EMAIL válido e ADMIN_PASSWORD ${passwordRequirementsText} (mesma regra do cadastro de clientes), no ambiente ou no backend/.env.`);
    for (const issue of input.error.issues) console.error(`  - ${issue.path.join(".") || "valor"}: ${issue.message}`);
    process.exit(1);
  }

  const customer = await prisma.user.findUnique({ where: { email: input.data.email }, select: { id: true, createdAt: true } });
  if (customer) {
    console.error(`Existe um CLIENTE comum com o e-mail ${input.data.email} (criado em ${customer.createdAt.toISOString()}).`);
    console.error("Ele não foi promovido. Decida o que fazer (usar outro ADMIN_EMAIL, remover ou renomear o cliente) e rode de novo.");
    process.exit(2);
  }

  const admin = await createAdmin(input.data);
  console.log(`Administrador criado: ${admin.email} · criado em ${admin.createdAt.toISOString()}`);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    console.error("O e-mail já está em uso (cadastrado em paralelo?). Rode de novo para ver o estado atual.");
    process.exitCode = 1;
  } else throw error;
} finally {
  await prisma.$disconnect();
}
