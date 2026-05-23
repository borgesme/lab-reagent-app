import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 把 admin@lab.local 重置到 e2e baseline (tokenVersion=0, currentRefreshJti=null).
 * 共享 admin 的 spec 应该在 beforeAll 里、login admin 之前调用一次,
 * 避免被前一个 spec 的 logout/refresh/reset-password 留下的脏状态影响.
 */
export async function resetAdminState(prisma: PrismaService): Promise<void> {
  await prisma.user.update({
    where: { email: 'admin@lab.local' },
    data: { tokenVersion: 0, currentRefreshJti: null },
  });
}
