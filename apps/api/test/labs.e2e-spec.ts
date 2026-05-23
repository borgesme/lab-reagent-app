import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';
import { resetAdminState } from './helpers/reset-admin';

describe('Labs & Roles', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await resetAdminState(prisma);
    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('create lab', async () => {
    const r = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '有机化学实验室', building: '化工楼3楼' });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    expect(r.body.data.name).toBe('有机化学实验室');
  });

  it('list labs', async () => {
    const r = await request(app.getHttpServer())
      .get('/labs')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('list roles', async () => {
    const r = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBe(5);
  });

  it('GET /labs/page 返回分页结构 + 默认 pageNum=1 pageSize=10', async () => {
    const r = await request(app.getHttpServer())
      .get('/labs/page')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('total');
    expect(data.pageNum).toBe(1);
    expect(data.pageSize).toBe(10);
    expect(Array.isArray(data.items)).toBe(true);
  });

  it('GET /labs/page pageNum=2 pageSize=1 跳过第 1 条', async () => {
    const all = await request(app.getHttpServer())
      .get('/labs/page?pageNum=1&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const firstPage = expectOk(all);
    if (firstPage.total < 2) return;

    const r = await request(app.getHttpServer())
      .get('/labs/page?pageNum=2&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.items.length).toBe(1);
    expect(data.items[0].id).not.toBe(firstPage.items[0].id);
  });

  it('GET /labs/page pageSize > 200 → 400', async () => {
    const r = await request(app.getHttpServer())
      .get('/labs/page?pageSize=999')
      .set('Authorization', `Bearer ${adminToken}`);
    expectBizError(r, 400);
  });

  it('POST /labs/batch-delete 事务全或无', async () => {
    const a = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'batch-lab-a', building: 'b1' });
    const b = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'batch-lab-b', building: 'b2' });
    const ids = [a.body.data.id, b.body.data.id];

    const r = await request(app.getHttpServer())
      .post('/labs/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids });
    const data = expectOk(r);
    expect(data.deleted).toBe(2);

    const after = await prisma.lab.findMany({
      where: { id: { in: ids } },
      select: { id: true, deletedAt: true },
    });
    expect(after.every((l) => l.deletedAt !== null)).toBe(true);

    await prisma.lab.deleteMany({ where: { id: { in: ids } } });
  });

  it('POST /labs/batch-delete 部分 id 不存在 → 404 + 不删任何', async () => {
    const a = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'partial-lab', building: 'p1' });
    const aId = a.body.data.id;

    const r = await request(app.getHttpServer())
      .post('/labs/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [aId, 'non-existent-xxx'] });
    expectBizError(r, 404);

    const survivor = await prisma.lab.findUnique({ where: { id: aId } });
    expect(survivor?.deletedAt).toBeNull();

    await prisma.lab.delete({ where: { id: aId } });
  });

  it('POST /labs/batch-delete 空 ids → 400', async () => {
    const r = await request(app.getHttpServer())
      .post('/labs/batch-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] });
    expectBizError(r, 400);
  });
});
