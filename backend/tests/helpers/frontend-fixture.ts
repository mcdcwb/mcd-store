import "./assert-isolated-database.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdmin } from "../../src/services/admin.service.js";
import { createUser } from "../../src/services/user.service.js";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;
const registerEmail = process.env.E2E_REGISTER_EMAIL;
const profilePrefix = process.env.E2E_PROFILE_PREFIX;
if (!email || !/^browser-[a-f0-9-]+@example\.test$/.test(email) || !password ||
    !userEmail || !/^customer-[a-f0-9-]+@example\.test$/.test(userEmail) || !userPassword ||
    !registerEmail || !/^register-[a-f0-9-]+@example\.test$/.test(registerEmail) ||
    !profilePrefix || !/^profile-[a-f0-9-]{36}$/.test(profilePrefix)) {
  throw new Error("Credenciais temporárias de teste ausentes.");
}
try {
  if (process.argv[2] === "create") {
    await createAdmin({ email, password });
    await createUser({ name: "Cliente Browser", email: userEmail, password: userPassword });
    for (const suffix of ["personal", "address", "lookup", "password"]) {
      await createUser({ name: "Nome Completo Perfil", email: `${profilePrefix}-${suffix}@example.test`, password: userPassword });
    }
  } else if (process.argv[2] === "delete") {
    await prisma.admin.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email: { in: [userEmail, registerEmail] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: profilePrefix + "-", endsWith: "@example.test" } } });
  }
  else throw new Error("Ação de teste desconhecida.");
} finally {
  await prisma.$disconnect();
}
