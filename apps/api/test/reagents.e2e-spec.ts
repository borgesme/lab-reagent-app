import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Reagents', () => {
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
    await prisma.purchaseReceipt.deleteMany({});
    await prisma.purchaseApproval.deleteMany({});
    await prisma.purchaseRequest.deleteMany({});
    await prisma.purchaseBatch.deleteMany({});
    await prisma.issueRecord.deleteMany({});
    await prisma.approval.deleteMany({});
    await prisma.request.deleteMany({});
    await prisma.reagentStock.deleteMany({});
    await prisma.reagent.deleteMany({ where: { name: { startsWith: 'TestReagent' } } });

    const r1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r1.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'plain-p2@lab.local', name: 'Plain', password: 'pass1234' });
    const r2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-p2@lab.local', password: 'pass1234' });
    plainToken = r2.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin creates reagent', async () => {
    const r = await request(app.getHttpServer())
      .post('/reagents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'TestReagent-Acetone',
        cas: '67-64-1',
        formula: 'C3H6O',
        specification: '500mL',
        category: '有机',
        hazardLevel: 'DANGEROUS',
      });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    expect(r.body.data.name).toBe('TestReagent-Acetone');
  });

  it('plain user can list reagents', async () => {
    const r = await request(app.getHttpServer())
      .get('/reagents')
      .set('Authorization', `Bearer ${plainToken}`);
    const data = expectOk(r);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('plain user cannot create reagent', async () => {
    const r = await request(app.getHttpServer())
      .post('/reagents')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({ name: 'TestReagent-X' });
    expectBizError(r, 403);
  });

  it('search by name', async () => {
    const r = await request(app.getHttpServer())
      .get('/reagents?q=Acetone')
      .set('Authorization', `Bearer ${plainToken}`);
    const data = expectOk(r);
    expect(data.some((x: any) => x.name.includes('Acetone'))).toBe(true);
  });

  it('controlled=1 仅返回受控试剂', async () => {
    await prisma.reagent.upsert({
      where: { id: 'reagent-ctrl-list' },
      update: {},
      create: {
        id: 'reagent-ctrl-list',
        name: 'TestReagent-ControlledList',
        hazardLevel: 'CONTROLLED',
        controlType: 'TOXIC',
        category: '管控',
      },
    });
    const r = await request(app.getHttpServer())
      .get('/reagents?controlled=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBeGreaterThan(0);
    expect(
      data.every(
        (x: any) => x.hazardLevel === 'CONTROLLED' || x.controlType != null,
      ),
    ).toBe(true);
  });
});
