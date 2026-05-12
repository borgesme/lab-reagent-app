import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Alerts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let labHeadToken: string;
  let labHeadId: string;
  let plainToken: string;
  let reagentId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.labReagentConfig.deleteMany({});

    const alertEmails = ['lh-alerts@lab.local', 'plain-alerts@lab.local'];
    const existing = await prisma.user.findMany({
      where: { email: { in: alertEmails } },
      select: { id: true },
    });
    if (existing.length) {
      await prisma.userRole.deleteMany({
        where: { userId: { in: existing.map((u) => u.id) } },
      });
    }

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'lh-alerts@lab.local', name: 'LH', password: 'pass1234' });
    let r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-alerts@lab.local', password: 'pass1234' });
    labHeadToken = r.body.data.accessToken;
    const u = await prisma.user.findUnique({ where: { email: 'lh-alerts@lab.local' } });
    labHeadId = u!.id;
    await prisma.user.update({ where: { id: labHeadId }, data: { labId: 'lab-default' } });
    const role = await prisma.role.findUnique({ where: { code: 'LAB_HEAD' } });
    await prisma.userRole.create({ data: { userId: labHeadId, roleId: role!.id } });
    r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-alerts@lab.local', password: 'pass1234' });
    labHeadToken = r.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'plain-alerts@lab.local', name: 'Plain', password: 'pass1234' });
    const pl = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-alerts@lab.local', password: 'pass1234' });
    plainToken = pl.body.data.accessToken;

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-alerts' },
      update: {},
      create: { id: 'reagent-alerts', name: 'AlertReagent', category: '普通' },
    });
    reagentId = reagent.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('LabReagentConfig CRUD', () => {
    it('POST /lab-reagent-configs creates', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '100', expireWarningDays: 30 });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(200);
      expect(res.body.data.safetyStock).toBe('100');
    });

    it('409 on duplicate (labId, reagentId)', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '200' });
      expectBizError(res, 409);
    });

    it('400 on negative safetyStock', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId: 'reagent-alerts', safetyStock: '-1' });
      expectBizError(res, 400);
    });

    it('forbidden for plain user', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '1' });
      expectBizError(res, 403);
    });

    it('GET /lab-reagent-configs returns lab list', async () => {
      const res = await request(app.getHttpServer())
        .get('/lab-reagent-configs?labId=lab-default')
        .set('Authorization', `Bearer ${labHeadToken}`);
      const data = expectOk(res);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AlertsService.runDaily', () => {
    it('creates notifications for expiring + low stock + reconcile', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);

      await prisma.labReagentConfig.upsert({
        where: {
          labId_reagentId: { labId: 'lab-default', reagentId },
        },
        update: { safetyStock: '100' },
        create: { labId: 'lab-default', reagentId, safetyStock: '100' },
      });
      const nearExpire = new Date();
      nearExpire.setDate(nearExpire.getDate() + 10);
      await prisma.reagentStock.upsert({
        where: { id: 'stock-alert-low' },
        update: {
          currentQty: '50',
          initialQty: '500',
          expireDate: nearExpire,
        },
        create: {
          id: 'stock-alert-low',
          reagentId,
          labId: 'lab-default',
          initialQty: '500',
          currentQty: '50',
          unit: 'mL',
          expireDate: nearExpire,
        },
      });

      await prisma.notification.deleteMany({ where: { recipientId: labHeadId } });

      await alerts.runDaily();

      const notifs = await prisma.notification.findMany({
        where: { recipientId: labHeadId },
      });
      const types = new Set(notifs.map((n) => n.type));
      expect(types.has('ALERT_LOW_STOCK')).toBe(true);
      expect(types.has('ALERT_EXPIRING')).toBe(true);
    });

    it('second runDaily same day is idempotent', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);
      const before = await prisma.notification.count({
        where: { recipientId: labHeadId, readAt: null },
      });
      await alerts.runDaily();
      const after = await prisma.notification.count({
        where: { recipientId: labHeadId, readAt: null },
      });
      expect(after).toBe(before);
    });

    it('skips lowStock when config absent but still emits expiring', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);

      const r2 = await prisma.reagent.upsert({
        where: { id: 'reagent-no-config' },
        update: {},
        create: { id: 'reagent-no-config', name: 'NoConfig', category: '普通' },
      });
      const nearExpire = new Date();
      nearExpire.setDate(nearExpire.getDate() + 5);
      await prisma.reagentStock.upsert({
        where: { id: 'stock-noconfig' },
        update: { expireDate: nearExpire },
        create: {
          id: 'stock-noconfig',
          reagentId: r2.id,
          labId: 'lab-default',
          initialQty: '100',
          currentQty: '100',
          unit: 'mL',
          expireDate: nearExpire,
        },
      });
      await prisma.notification.deleteMany({ where: { recipientId: labHeadId } });
      await alerts.runDaily();
      const low = await prisma.notification.findFirst({
        where: {
          recipientId: labHeadId,
          type: 'ALERT_LOW_STOCK',
          payload: { path: ['reagentId'], equals: r2.id },
        },
      });
      expect(low).toBeNull();
      const expiring = await prisma.notification.findFirst({
        where: {
          recipientId: labHeadId,
          type: 'ALERT_EXPIRING',
          payload: { path: ['reagentId'], equals: r2.id },
        },
      });
      expect(expiring).not.toBeNull();
    });

    it('reports controlled reconcile anomaly when qty mismatch', async () => {
      const alerts = app.get((await import('../src/alerts/alerts.service')).AlertsService);

      const ctrl = await prisma.reagent.upsert({
        where: { id: 'reagent-ctrl-alert' },
        update: {},
        create: {
          id: 'reagent-ctrl-alert',
          name: 'CtrlAlert',
          category: '管控',
          hazardLevel: 'CONTROLLED',
          controlType: 'TOXIC',
        },
      });
      await prisma.reagentStock.upsert({
        where: { id: 'stock-ctrl-ok' },
        update: { initialQty: '500', currentQty: '500' },
        create: {
          id: 'stock-ctrl-ok',
          reagentId: ctrl.id,
          labId: 'lab-default',
          initialQty: '500',
          currentQty: '500',
          unit: 'mL',
        },
      });
      await prisma.reagentStock.upsert({
        where: { id: 'stock-ctrl-bad' },
        update: { initialQty: '500', currentQty: '100' },
        create: {
          id: 'stock-ctrl-bad',
          reagentId: ctrl.id,
          labId: 'lab-default',
          initialQty: '500',
          currentQty: '100',
          unit: 'mL',
        },
      });

      await prisma.notification.deleteMany({
        where: { recipientId: labHeadId, type: 'ALERT_RECONCILE' },
      });
      await alerts.runDaily();
      const rec = await prisma.notification.findFirst({
        where: {
          recipientId: labHeadId,
          type: 'ALERT_RECONCILE',
          payload: { path: ['reagentId'], equals: ctrl.id },
        },
      });
      expect(rec).not.toBeNull();
    });
  });
});
