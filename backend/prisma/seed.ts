import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@hton.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@123';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName: 'Quản trị viên',
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  console.log(`Admin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
