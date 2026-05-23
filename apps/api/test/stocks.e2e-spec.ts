import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';
import { resetAdminState } from './helpers/reset-admin';

describe('Stocks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let reagentId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await resetAdminState(prisma);
    await prisma.reagentStock.deleteMany({
      where: { batchNo: { startsWith: 'TestBatch' } },
    });

    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.data.accessToken;

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-test-stock' },
      update: {},
      create: {
        id: 'reagent-test-stock',
        name: 'TestReagent-StockFixture',
        category: '有机',
      },
    });
    reagentId = reagent.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin creates stock (入库)', async () => {
    const r = await request(app.getHttpServer())
      .post('/stocks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reagentId,
        labId: 'lab-default',
        batchNo: 'TestBatch-001',
        initialQty: '500',
        currentQty: '500',
        unit: 'mL',
        location: 'A-柜-1层',
      });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    expect(r.body.data.batchNo).toBe('TestBatch-001');
    expect(r.body.data.reagentId).toBe(reagentId);
  });

  it('list stocks', async () => {
    const r = await request(app.getHttpServer())
      .get('/stocks')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('filter by reagentId', async () => {
    const r = await request(app.getHttpServer())
      .get(`/stocks?reagentId=${reagentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.every((s: any) => s.reagentId === reagentId)).toBe(true);
  });

  it('update stock qty', async () => {
    const list = await request(app.getHttpServer())
      .get(`/stocks?reagentId=${reagentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const stockId = list.body.data[0].id;
    const r = await request(app.getHttpServer())
      .patch(`/stocks/${stockId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentQty: '480', location: 'A-柜-2层' });
    const data = expectOk(r);
    expect(data.location).toBe('A-柜-2层');
  });

  it('plain user cannot create stock', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'plain-p2-stock@lab.local',
        name: 'PlainS',
        password: 'pass1234',
      });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-p2-stock@lab.local', password: 'pass1234' });
    const r = await request(app.getHttpServer())
      .post('/stocks')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({
        reagentId,
        labId: 'lab-default',
        initialQty: '100',
        currentQty: '100',
        unit: 'g',
      });
    expectBizError(r, 403);
  });
});
