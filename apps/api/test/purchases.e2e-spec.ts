import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
    adminToken = aLogin.body.accessToken;

    async function registerAndLogin(email: string, name: string) {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, name, password: 'pass1234' });
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'pass1234' });
      const u = await prisma.user.findUnique({ where: { email } });
      return { token: r.body.accessToken as string, id: u!.id };
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
    labHeadToken = lhRe.body.accessToken;
    const raRe = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ra-p5@lab.local', password: 'pass1234' });
    reagentAdminToken = raRe.body.accessToken;
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
      expect(res.body.status).toBe('PENDING');
      expect(res.body.applicantId).toBe(plainId);
      expect(res.body.labId).toBe('lab-default');
    });

    it('rejects when quantity is non-positive', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '0', unit: 'mL', reason: '测试' });
      expect(res.status).toBe(400);
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
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ reagentId, quantity: '1', unit: 'mL', reason: 't' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /purchases', () => {
    it('GET /purchases/mine returns own', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases/mine')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((p: any) => p.applicantId === plainId)).toBe(true);
    });

    it('GET /purchases returns lab list for REAGENT_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases')
        .set('Authorization', `Bearer ${reagentAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((p: any) => p.labId === 'lab-default')).toBe(true);
    });

    it('GET /purchases forbidden for plain user', async () => {
      const res = await request(app.getHttpServer())
        .get('/purchases')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /purchases/:id/cancel', () => {
    it('applicant cancels own PENDING', async () => {
      const create = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'cancel test' });
      const id = create.body.id;
      const res = await request(app.getHttpServer())
        .post(`/purchases/${id}/cancel`)
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(200);
      const db = await prisma.purchaseRequest.findUnique({ where: { id } });
      expect(db?.status).toBe('CANCELLED');
    });

    it('cannot cancel MERGED', async () => {
      const create = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: '10', unit: 'mL', reason: 'merge then cancel' });
      const id = create.body.id;
      await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'MERGED' },
      });
      const res = await request(app.getHttpServer())
        .post(`/purchases/${id}/cancel`)
        .set('Authorization', `Bearer ${plainToken}`);
      expect(res.status).toBe(409);
    });
  });

  describe('POST /purchases/batches (merge)', () => {
    async function createPR(qty: string) {
      const res = await request(app.getHttpServer())
        .post('/purchases')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ reagentId, quantity: qty, unit: 'mL', reason: 'merge' });
      return res.body.id as string;
    }

    it('rejects empty requestIds', async () => {
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [] });
      expect(res.status).toBe(400);
    });

    it('forbidden for LAB_HEAD', async () => {
      const id = await createPR('1');
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ requestIds: [id] });
      expect(res.status).toBe(403);
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
      expect(res.status).toBe(409);
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
      const b = bRes.body.id;
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [a, b] });
      expect(res.status).toBe(400);
    });

    it('merges two PENDING requests into a batch', async () => {
      const a = await createPR('100');
      const b = await createPR('200');
      const res = await request(app.getHttpServer())
        .post('/purchases/batches')
        .set('Authorization', `Bearer ${reagentAdminToken}`)
        .send({ requestIds: [a, b] });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(Number(res.body.totalQty)).toBe(300);
      const [dbA, dbB] = await Promise.all([
        prisma.purchaseRequest.findUnique({ where: { id: a } }),
        prisma.purchaseRequest.findUnique({ where: { id: b } }),
      ]);
      expect(dbA?.status).toBe('MERGED');
      expect(dbA?.batchId).toBe(res.body.id);
      expect(dbB?.batchId).toBe(res.body.id);
    });
  });
});
