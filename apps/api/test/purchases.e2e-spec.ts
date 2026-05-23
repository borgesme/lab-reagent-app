import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';
import { resetAdminState } from './helpers/reset-admin';

describe('Purchases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let labHeadToken: string;
  let labHeadId: string;
  let reagentAdminToken: string;
  let reagentAdminId: string;
  let plainToken: string;
  let plainId: string;
  let reagentId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await resetAdminState(prisma);
    await prisma.purchaseReceipt.deleteMany({});
    await prisma.purchaseApproval.deleteMany({});
    await prisma.purchaseRequest.deleteMany({});
    await prisma.purchaseBatch.deleteMany({});

    const p5Emails = [
      'lh-p5@lab.local',
      'ra-p5@lab.local',
      'plain-p5@lab.local',
      'nolab-p5@lab.local',
    ];
    const existingP5 = await prisma.user.findMany({
      where: { email: { in: p5Emails } },
      select: { id: true },
    });
    if (existingP5.length) {
      await prisma.userRole.deleteMany({
        where: { userId: { in: existingP5.map((u) => u.id) } },
      });
    }

    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = aLogin.body.data.accessToken;

    async function registerAndLogin(email: string, name: string) {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, name, password: 'pass1234' });
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'pass1234' });
      const u = await prisma.user.findUnique({ where: { email } });
      return { token: r.body.data.accessToken as string, id: u!.id };
    }

    const lh = await registerAndLogin('lh-p5@lab.local', 'LabHead');
    labHeadToken = lh.token;
    labHeadId = lh.id;
    await prisma.user.update({
      where: { id: labHeadId },
      data: { labId: 'lab-default' },
    });
    const lhRole = await prisma.role.findUnique({ where: { code: 'LAB_HEAD' } });
    await prisma.userRole.create({
      data: { userId: labHeadId, roleId: lhRole!.id },
    });

    const ra = await registerAndLogin('ra-p5@lab.local', 'ReagentAdmin');
    reagentAdminToken = ra.token;
    reagentAdminId = ra.id;
    await prisma.user.update({
      where: { id: reagentAdminId },
      data: { labId: 'lab-default' },
    });
    const raRole = await prisma.role.findUnique({ where: { code: 'REAGENT_ADMIN' } });
    await prisma.userRole.create({
      data: { userId: reagentAdminId, roleId: raRole!.id },
    });

    const pl = await registerAndLogin('plain-p5@lab.local', 'Plain');
    plainToken = pl.token;
    plainId = pl.id;
    await prisma.user.update({
      where: { id: plainId },
      data: { labId: 'lab-default' },
    });

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-p5' },
      update: {},
      create: { id: 'reagent-p5', name: 'P5Reagent', category: '普通' },
    });
    reagentId = reagent.id;

    const lhRe = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-p5@lab.local', password: 'pass1234' });
    labHeadToken = lhRe.body.data.accessToken;
    const raRe = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ra-p5@lab.local', password: 'pass1234' });
    reagentAdminToken = raRe.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /purchases', () => {
    it('creates a PurchaseRequest as plain user', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '500', unit: 'mL', reason: '实验需要' });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(200);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.applicantId).toBe(plainId);
      expect(res.body.data.labId).toBe('lab-default');
    });

    it('rejects when quantity is non-positive', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '0', unit: 'mL', reason: '测试' });
      expectBizError(res, 400);
    });

    it('rejects when user has no lab', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'nolab-p5@lab.local', name: 'NoLab', password: 'pass1234' });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nolab-p5@lab.local', password: 'pass1234' });
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({ reagentId, quantity: '1', unit: 'mL', reason: 't' });
      expectBizError(res, 403);
    });
  });

  describe('GET /purchases', () => {
    it('GET /purchases/mine returns own', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases/mine')
        .set('Authorization', `Bearer ${plainToken}`);
      const data = expectOk(res);
      expect(data.every((p: any) => p.applicantId === plainId)).toBe(true);
    });

    it('GET /purchases returns lab list for REAGENT_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases')
        .set('Authorization', `Bearer ${reagentAdminToken}`);
      const data = expectOk(res);
      expect(data.every((p: any) => p.labId === 'lab-default')).toBe(true);
    });

    it('GET /purchases forbidden for plain user', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases')
        .set('Authorization', `Bearer ${plainToken}`);
      expectBizError(res, 403);
    });
  });

  describe('POST /purchases/:id/cancel', () => {
    it('applicant cancels own PENDING', async () => {
      const create = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'cancel test' });
      const id = create.body.data.id;
      const res = await request(app.getHttpServer())
        .post(`/purchases/${id}/cancel`)
        .set('Authorization', `Bearer ${plainToken}`);
      expectOk(res);
      const db = await prisma.purchaseRequest.findUnique({ where: { id } });
      expect(db?.status).toBe('CANCELLED');
    });

    it('cannot cancel MERGED', async () => {
      const create = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'merge then cancel' });
      const id = create.body.data.id;
      await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'MERGED' },
      });
      const res = await request(app.getHttpServer())
        .post(`/purchases/${id}/cancel`)
        .set('Authorization', `Bearer ${plainToken}`);
      expectBizError(res, 409);
    });
  });

  describe('POST /purchases/batches (merge)', () => {
    async function createPR(qty: string) {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: qty, unit: 'mL', reason: 'merge' });
      return res.body.data.id as string;
    }

    it('rejects empty requestIds', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [] });
      expectBizError(res, 400);
    });

    it('forbidden for LAB_HEAD', async () => {
      const id = await createPR('1');
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ requestIds: [id] });
      expectBizError(res, 403);
    });

    it('409 when any request not PENDING', async () => {
      const id = await createPR('1');
      await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [id] });
      expectBizError(res, 409);
    });

    it('400 when reagent differs', async () => {
      const r2 = await prisma.reagent.upsert({
        where: { id: 'reagent-p5-b' },
        update: {},
        create: { id: 'reagent-p5-b', name: 'P5B', category: '普通' },
      });
      const a = await createPR('1');
      const bRes = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId: r2.id, quantity: '1', unit: 'mL', reason: 't' });
      const b = bRes.body.data.id;
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [a, b] });
      expectBizError(res, 400);
    });

    it('merges two PENDING requests into a batch', async () => {
      const a = await createPR('100');
      const b = await createPR('200');
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [a, b] });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(200);
      const data = res.body.data;
      expect(data.status).toBe('PENDING');
      expect(Number(data.totalQty)).toBe(300);
      const [dbA, dbB] = await Promise.all([
        prisma.purchaseRequest.findUnique({ where: { id: a } }),
        prisma.purchaseRequest.findUnique({ where: { id: b } }),
      ]);
      expect(dbA?.status).toBe('MERGED');
      expect(dbA?.batchId).toBe(data.id);
      expect(dbB?.batchId).toBe(data.id);
    });
  });

  describe('POST /purchases/batches/:id/approve', () => {
    async function newBatch() {
      const r = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'x' });
      const m = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [r.body.data.id] });
      return { batchId: m.body.data.id as string, requestId: r.body.data.id as string };
    }

    it('APPROVE flips batch status and notifies REAGENT_ADMIN', async () => {
      await prisma.notification.deleteMany({ where: { recipientId: reagentAdminId } });
      const { batchId } = await newBatch();
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE', comment: 'ok' });
      expectOk(res);
      const db = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
      expect(db?.status).toBe('APPROVED');
      const notif = await prisma.notification.findFirst({
        where: { recipientId: reagentAdminId, type: 'PURCHASE_APPROVED' },
      });
      expect(notif).not.toBeNull();
    });

    it('REJECT rolls items back to PENDING and notifies applicants', async () => {
      await prisma.notification.deleteMany({ where: { recipientId: plainId } });
      const { batchId, requestId } = await newBatch();
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'REJECT', comment: '预算不足' });
      expectOk(res);
      const b = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
      expect(b?.status).toBe('REJECTED');
      expect(b?.rejectedReason).toBe('预算不足');
      const pr = await prisma.purchaseRequest.findUnique({ where: { id: requestId } });
      expect(pr?.status).toBe('PENDING');
      expect(pr?.batchId).toBeNull();
      const notif = await prisma.notification.findFirst({
        where: { recipientId: plainId, type: 'PURCHASE_REJECTED' },
      });
      expect(notif).not.toBeNull();
    });

    it('409 when batch not PENDING', async () => {
      const { batchId } = await newBatch();
      await prisma.purchaseBatch.update({
        where: { id: batchId },
        data: { status: 'APPROVED' },
      });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE' });
      expectBizError(res, 409);
    });

    it('forbidden for non-lab LAB_HEAD', async () => {
      const { batchId } = await newBatch();
      await prisma.lab.upsert({
        where: { id: 'other-lab' },
        update: {},
        create: { id: 'other-lab', name: '其他实验室' },
      });
      await prisma.user.update({
        where: { id: labHeadId },
        data: { labId: 'other-lab' },
      });
      const newLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'lh-p5@lab.local', password: 'pass1234' });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${newLogin.body.data.accessToken}`)
        .send({ action: 'APPROVE' });
      expectBizError(res, 403);
      await prisma.user.update({
        where: { id: labHeadId },
        data: { labId: 'lab-default' },
      });
    });
  });

  describe('POST /purchases/batches/:id/receipt', () => {
    async function approvedBatch() {
      const r = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '50', unit: 'mL', reason: 'receive' });
      const m = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [r.body.data.id] });
      await request(app.getHttpServer())
        .post(`/purchases/batches/${m.body.data.id}/approve`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE' });
      return m.body.data.id as string;
    }

    it('creates ReagentStock and Receipt, notifies applicants', async () => {
      await prisma.notification.deleteMany({ where: { recipientId: plainId } });
      const batchId = await approvedBatch();
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({
          actualQty: '50',
          batchNo: 'P5RCV-001',
          supplier: 'ACME',
          purchasePrice: '123.45',
          location: 'A-01',
        });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(200);
      expect(res.body.data.stockId).toBeDefined();

      const stock = await prisma.reagentStock.findUnique({
        where: { id: res.body.data.stockId },
      });
      expect(stock?.batchNo).toBe('P5RCV-001');
      expect(Number(stock?.initialQty)).toBe(50);
      expect(Number(stock?.currentQty)).toBe(50);

      const b = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
      expect(b?.status).toBe('RECEIVED');

      const notif = await prisma.notification.findFirst({
        where: { recipientId: plainId, type: 'PURCHASE_RECEIVED' },
      });
      expect(notif).not.toBeNull();
    });

    it('409 on second receipt', async () => {
      const batchId = await approvedBatch();
      await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ actualQty: '1' });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${batchId}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ actualQty: '1' });
      expectBizError(res, 409);
    });

    it('409 when batch not APPROVED', async () => {
      const r = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 't' });
      const m = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [r.body.data.id] });
      const res = await request(app.getHttpServer())
        .post(`/purchases/batches/${m.body.data.id}/receipt`)
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ actualQty: '10' });
      expectBizError(res, 409);
    });
  });
});
