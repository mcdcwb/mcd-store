// Garante a conta do PAINEL DEMONSTRATIVO (somente leitura), de forma idempotente.
// Substitui o antigo src/scripts/create-demo-admin.ts (que criava um ADMIN com acesso total).
//
// Uso local:  DATABASE_URL=<postgres local mcd_store_demo> npm run seed:demo-admin
//
// - E-mail e senha vêm de DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD. Se não estiverem no ambiente do
//   terminal, são lidas do backend/.env — SÓ essas duas chaves; o DATABASE_URL nunca é lido de arquivo.
// - A conta criada tem isDemo = true: entra só por POST /auth/demo-login (o login normal a recusa)
//   e todas as escritas são bloqueadas (middlewares/block-demo-writes.ts).
// - Se a conta demo já existe: não altera nada. Se o e-mail pertence a um admin/cliente comum: recusa.
// - Banco remoto (Neon) só com NODE_ENV=production, MCD_DEMO_ALLOW_REMOTE_DATABASE=1 e
//   ALLOW_DEMO_ADMIN_BOOTSTRAP=1 (além das travas de src/lib/prisma.ts).
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  const fileValues = parse(readFileSync(envFile));
  for (const key of ["DEMO_ADMIN_EMAIL", "DEMO_ADMIN_PASSWORD"] as const) {
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
const { hashPassword } = await import("../src/lib/password.js");
const { registerUniqueEmail } = await import("../src/lib/account-registration.js");
const { prisma } = await import("../src/lib/prisma.js"); // recusa bancos fora dos autorizados

try {
  const [{ name: database }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  console.log(`Banco: ${database} (${isLocal ? "local" : "remoto"})`);

  const input = createAdminSchema.safeParse({ email: process.env.DEMO_ADMIN_EMAIL, password: process.env.DEMO_ADMIN_PASSWORD });
  if (!input.success) {
    console.error(`Defina DEMO_ADMIN_EMAIL válido e DEMO_ADMIN_PASSWORD ${passwordRequirementsText} (mesma regra do cadastro de clientes), no ambiente ou no backend/.env.`);
    for (const issue of input.error.issues) console.error(`  - ${issue.path.join(".") || "valor"}: ${issue.message}`);
    process.exit(1);
  }
  const { email, password } = input.data;

  const existingDemo = await prisma.admin.findMany({ where: { isDemo: true }, select: { email: true, createdAt: true, active: true } });
  if (existingDemo.some(admin => admin.email === email)) {
    const demo = existingDemo.find(admin => admin.email === email)!;
    console.log(`A conta demonstrativa já existe: ${demo.email} · criada em ${demo.createdAt.toISOString()}${demo.active ? "" : " · INATIVA"}. Nada foi alterado.`);
    process.exit(0);
  }
  if (existingDemo.length) console.warn(`Aviso: já existe outra conta demonstrativa (${existingDemo.map(a => a.email).join(", ")}); o /auth/demo-login usa a mais antiga ativa.`);

  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (admin || user) {
    console.error(`O e-mail ${email} já pertence a ${admin ? "um administrador comum" : "um cliente"}. Ele NÃO foi convertido em conta demo; use outro DEMO_ADMIN_EMAIL.`);
    process.exit(2);
  }

  // Mesmo hash do cadastro normal (argon2id via lib/password.ts).
  const passwordHash = await hashPassword(password);
  const created = await registerUniqueEmail(email, tx => tx.admin.create({ data: { email, passwordHash, isDemo: true }, select: { email: true, createdAt: true } }));
  console.log(`Conta demonstrativa criada: ${created.email} · criada em ${created.createdAt.toISOString()}`);
} finally {
  await prisma.$disconnect();
}
