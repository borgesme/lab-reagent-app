import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Requests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let plainToken: string;
  let plainUserId: string;
  let reagentId: string;
  let stockId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.issueRecord.deleteMany({});
    await prisma.approval.deleteMany({});
    await prisma.request.deleteMany({});

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = adminLogin.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'requester@lab.local', name: 'Requester', password: 'pass1234' });
    const reqLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'requester@lab.local', password: 'pass1234' });
    plainToken = reqLogin.body.accessToken;
    const u = await prisma.user.findUnique({ where: { email: 'requester@lab.local' } });
    plainUserId = u!.id;
    await prisma.user.update({
      where: { id: plainUserId },
      data: { labId: 'lab-default' },
    });

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-req-test' },
      update: {},
      create: { id: 'reagent-req-test', name: 'TestReagent-ReqFlow', category: '有机' },
    });
    reagentId = reagent.id;

    const stock = await prisma.reagentStock.create({
      data: {
        reagentId,
        labId: 'lab-default',
        batchNo: 'ReqBatch-01',
        initialQty: '1000',
        currentQty: '1000',
        unit: 'mL',
      },
    });
    stockId = stock.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('applicant creates request (PENDING)', async () => {
    const r = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '50',
        unit: 'mL',
        purpose: '做反应实验',
      });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PENDING');
    expect(r.body.labId).toBe('lab-default');
    expect(r.body.applicantId).toBe(plainUserId);
  });

  it('applicant lists only own requests', async () => {
    const r = await request(app.getHttpServer())
      .get('/requests')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.every((x: any) => x.applicantId === plainUserId)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('SYS_ADMIN lists all', async () => {
    const r = await request(app.getHttpServer())
      .get('/requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('rejects request when quantity exceeds stock', async () => {
    const r = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '99999',
        unit: 'mL',
        purpose: '超库存申请',
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/stock|库存/i);
  });

  it('applicant cancels own pending request', async () => {
    const create = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '10',
        unit: 'mL',
        purpose: '待取消',
      });
    const id = create.body.id;
    const r = await request(app.getHttpServer())
      .post(`/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELLED');
  });

  it('cannot cancel other user request', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'other@lab.local', name: 'Other', password: 'pass1234' });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'other@lab.local', password: 'pass1234' });

    const create = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '10',
        unit: 'mL',
        purpose: '非法取消测试',
      });
    const id = create.body.id;
    const r = await request(app.getHttpServer())
      .post(`/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`);
    expect(r.status).toBe(403);
  });
});
