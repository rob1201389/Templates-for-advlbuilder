import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

/**
 * First-run seed: creates the RSMotoCons tenant and its Admin account.
 *
 * Run with:  npx tsx prisma/seed.ts
 *
 * The initial password comes from ADMIN_INITIAL_PASSWORD in the environment
 * (never hardcoded here — this file is committed to the repo). Whatever it
 * is, mustChangePassword forces the admin to set a fresh one on first
 * login, so the seed value is only ever a bootstrap credential.
 */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@rsmotocons.com";
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("Set ADMIN_INITIAL_PASSWORD (min 8 chars) before seeding.");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: "rsmotocons" },
    update: {},
    create: { name: "RSMotoCons", slug: "rsmotocons" },
  });

  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: email.toLowerCase() },
  });
  if (existing) {
    console.log("Admin already exists — nothing to do.");
    return;
  }

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: email.toLowerCase(),
      firstName: "Admin",
      lastName: "RSMotoCons",
      role: "DEALER_PRINCIPAL",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword: true,
    },
  });
  console.log(`Admin account created for ${email}. Password must be changed on first login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
