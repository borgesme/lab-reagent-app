import { PrismaClient, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const roleList: { code: RoleCode; name: string }[] = [
    { code: 'PLAIN_USER', name: '普通使用者' },
    { code: 'LAB_HEAD', name: '实验室负责人' },
    { code: 'REAGENT_ADMIN', name: '试剂管理员' },
    { code: 'SAFETY_OFFICER', name: '安全员' },
    { code: 'SYS_ADMIN', name: '系统管理员' },
  ];
  for (const r of roleList) {
    await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
  }

  const lab = await prisma.lab.upsert({
    where: { id: 'lab-default' },
    update: {},
    create: { id: 'lab-default', name: '默认实验室' },
  });

  const sysRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SYS_ADMIN' } });
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lab.local' },
    update: {},
    create: {
      email: 'admin@lab.local',
      name: '系统管理员',
      passwordHash,
      labId: lab.id,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: sysRole.id } },
    update: {},
    create: { userId: admin.id, roleId: sysRole.id },
  });

  const sampleReagents = [
    { name: '丙酮', cas: '67-64-1', formula: 'C3H6O', category: '有机', hazardLevel: 'DANGEROUS' as const },
    { name: '氯化钠', cas: '7647-14-5', formula: 'NaCl', category: '无机', hazardLevel: 'NORMAL' as const },
    { name: '硫酸', cas: '7664-93-9', formula: 'H2SO4', category: '无机', hazardLevel: 'DANGEROUS' as const },
  ];
  for (const r of sampleReagents) {
    await prisma.reagent.upsert({
      where: { id: `seed-${r.cas}` },
      update: {},
      create: { id: `seed-${r.cas}`, ...r },
    });
  }
  console.log('seed done');
}

main().finally(() => prisma.$disconnect());
