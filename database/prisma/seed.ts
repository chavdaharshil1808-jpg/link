import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const adminPassword = await bcrypt.hash("admin123456", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@universaldl.com" },
    update: {},
    create: {
      email: "admin@universaldl.com",
      name: "Admin",
      passwordHash: adminPassword,
      role: "ADMIN",
      emailVerified: true,
      settings: {
        create: {
          theme: "DARK",
          concurrentDownloads: 5,
          defaultFormat: "best",
        },
      },
    },
  });

  console.log(`Admin user: ${admin.email}`);
  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
