import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Reports (M1 stubs)', () => {
  let app: INestApplication;
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const admin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = admin.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'reports-plain@lab.local',
        name: 'Plain',
        password: 'pass1234',
      });
    const plain = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reports-plain@lab.local', password: 'pass1234' });
    plainToken = plain.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('scope matrix', () => {
    it('SYS_ADMIN may access all 4 reports', async () => {
      for (const slug of [
        'usage-trend',
        'inventory-turnover',
        'purchase-amount',
        'controlled-audit',
      ]) {
        const r = await request(app.getHttpServer())
          .get(`/reports/${slug}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(r.status).toBe(200);
      }
    });

    it('PLAIN_USER may access usage-trend only', async () => {
      const ok = await request(app.getHttpServer())
        .get('/reports/usage-trend')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(ok.status).toBe(200);

      for (const slug of [
        'inventory-turnover',
        'purchase-amount',
        'controlled-audit',
      ]) {
        const r = await request(app.getHttpServer())
          .get(`/reports/${slug}`)
          .set('Authorization', `Bearer ${plainToken}`);
        expect(r.status).toBe(403);
        expect(r.body.code ?? r.body.message?.code).toBe('REPORT_SCOPE_DENIED');
      }
    });
  });

  describe('usage-trend', () => {
    let prisma: import('../src/prisma/prisma.service').PrismaService;

    beforeAll(async () => {
      prisma = (app as any).get(
        require('../src/prisma/prisma.service').PrismaService,
      );

      const adminUser = await prisma.user.findUnique({
        where: { email: 'admin@lab.local' },
      });
      const reagent = await prisma.reagent.upsert({
        where: { id: 'reagent-p7-usage' },
        update: {},
        create: { id: 'reagent-p7-usage', name: 'P7-UsageReagent', category: '有机' },
      });
      const stock = await prisma.reagentStock.upsert({
        where: { id: 'stock-p7-usage' },
        update: { currentQty: '500.000', initialQty: '500.000' },
        create: {
          id: 'stock-p7-usage',
          reagentId: reagent.id,
          labId: 'lab-default',
          batchNo: 'P7-Batch-01',
          initialQty: '500.000',
          currentQty: '500.000',
          unit: 'g',
        },
      });
      const req = await prisma.request.create({
        data: {
          applicantId: adminUser!.id,
          labId: 'lab-default',
          reagentId: reagent.id,
          stockId: stock.id,
          quantity: '1.000',
          unit: 'g',
          purpose: 'p7-test',
          status: 'ISSUED',
        },
      });
      await prisma.issueRecord.create({
        data: {
          requestId: req.id,
          issuerId: adminUser!.id,
          receiverId: adminUser!.id,
          stockId: stock.id,
          actualQty: '1.000',
        },
      });
    });

    it('returns summary + series for SYS_ADMIN', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d&groupBy=day')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        totalIssued: expect.any(String),
        distinctReagents: expect.any(Number),
        avgDailyIssued: expect.any(String),
      });
      expect(Array.isArray(r.body.series)).toBe(true);
      expect(Number(r.body.summary.totalIssued)).toBeGreaterThan(0);
    });

    it('PLAIN_USER scope=self returns only self issues (empty for fresh plain user)', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary.distinctReagents).toBe(0);
      expect(r.body.series).toEqual([]);
    });

    it('rejects custom range without dates', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=custom')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(400);
    });
  });

  describe('inventory-turnover', () => {
    it('SYS_ADMIN gets summary + rows', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        avgTurnoverDays: expect.any(Number),
        lowStockCount: expect.any(Number),
      });
      expect(Array.isArray(r.body.rows)).toBe(true);
      for (const row of r.body.rows) {
        expect(row).toMatchObject({
          reagentId: expect.any(String),
          name: expect.any(String),
          currentQty: expect.any(String),
          turnoverDays: expect.any(Number),
          status: expect.stringMatching(/^(ok|low|stale)$/),
        });
      }
    });

    it('LAB_HEAD scope=lab filter (rows only contain own lab stocks)', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
    });

    it('PLAIN_USER forbidden', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(403);
    });
  });

  describe('purchase-amount', () => {
    it('SYS_ADMIN groupBy=month returns summary + series', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/purchase-amount?range=365d&groupBy=month')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        totalAmount: expect.any(String),
        batchCount: expect.any(Number),
        pendingBatchCount: expect.any(Number),
      });
      expect(Array.isArray(r.body.series)).toBe(true);
      for (const row of r.body.series) {
        expect(row.amount).toMatch(/^\d+\.\d{2}$/);
      }
    });

    it('groupBy=supplier returns one row per supplier', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/purchase-amount?range=365d&groupBy=supplier')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
    });

    it('PLAIN_USER forbidden', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/purchase-amount')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(403);
    });
  });

  describe('controlled-audit', () => {
    it('SYS_ADMIN sees rows desc by ts', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/controlled-audit?range=365d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.body.summary).toMatchObject({
        totalEvents: expect.any(Number),
        distinctActors: expect.any(Number),
      });
      expect(Array.isArray(r.body.rows)).toBe(true);
    });

    it('SAFETY_OFFICER allowed (scope=all)', async () => {
      if (!process.env.SEED_SAFETY_USER) return;
      const r = await request(app.getHttpServer())
        .get('/reports/controlled-audit?range=30d')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
    });

    it('PLAIN_USER forbidden', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/controlled-audit')
        .set('Authorization', `Bearer ${plainToken}`);
      expect(r.status).toBe(403);
    });
  });

  describe('CSV export', () => {
    it('usage-trend csv has BOM + headers', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/usage-trend?range=30d&format=csv')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      expect(r.headers['content-disposition']).toMatch(/attachment/);
      expect(r.text.charCodeAt(0)).toBe(0xfeff);
      const firstLine = r.text.replace(/^﻿/, '').split('\n')[0];
      expect(firstLine).toContain('bucket');
      expect(firstLine).toContain('qty');
    });

    it('inventory-turnover csv has reagent columns', async () => {
      const r = await request(app.getHttpServer())
        .get('/reports/inventory-turnover?range=30d&format=csv')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      const firstLine = r.text.replace(/^﻿/, '').split('\n')[0];
      expect(firstLine).toContain('reagentId');
      expect(firstLine).toContain('turnoverDays');
    });
  });
});
