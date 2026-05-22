import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Dashboard KPI', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // 幂等清理 kpi-plain 残留（上次跑挂可能留下）
    await prisma.userRole.deleteMany({
      where: { user: { email: 'kpi-plain@lab.local' } },
    });
    await prisma.user.deleteMany({
      where: { email: 'kpi-plain@lab.local' },
    });

    const ar = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = ar.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'kpi-plain@lab.local', name: 'KpiPlain', password: 'pass1234' });
    const pr = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'kpi-plain@lab.local', password: 'pass1234' });
    plainToken = pr.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: { user: { email: 'kpi-plain@lab.local' } },
    });
    await prisma.user.deleteMany({
      where: { email: 'kpi-plain@lab.local' },
    });
    await app.close();
  });

  it('未登录 → 401', async () => {
    const r = await request(app.getHttpServer()).get('/dashboard/kpi');
    expectBizError(r, 401);
  });

  it('SYS_ADMIN 登录 → 四 key 均为 number', async () => {
    const r = await request(app.getHttpServer())
      .get('/dashboard/kpi')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(typeof data.pendingApprovals).toBe('number');
    expect(typeof data.myRequests).toBe('number');
    expect(typeof data.stockAlerts).toBe('number');
    expect(typeof data.controlledReagents).toBe('number');
  });

  it('普通用户 → pendingApprovals 为 0', async () => {
    const r = await request(app.getHttpServer())
      .get('/dashboard/kpi')
      .set('Authorization', `Bearer ${plainToken}`);
    const data = expectOk(r);
    expect(data.pendingApprovals).toBe(0);
    expect(typeof data.myRequests).toBe('number');
    expect(typeof data.stockAlerts).toBe('number');
    expect(typeof data.controlledReagents).toBe('number');
  });

  it('controlledReagents 反映 hazardLevel=CONTROLLED 或 controlType 非空且未软删的总数', async () => {
    const expected = await prisma.reagent.count({
      where: {
        deletedAt: null,
        OR: [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }],
      },
    });
    const r = await request(app.getHttpServer())
      .get('/dashboard/kpi')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.controlledReagents).toBe(expected);
  });
});
