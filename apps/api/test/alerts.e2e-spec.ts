import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
    labHeadToken = r.body.accessToken;
    const u = await prisma.user.findUnique({ where: { email: 'lh-alerts@lab.local' } });
    labHeadId = u!.id;
    await prisma.user.update({ where: { id: labHeadId }, data: { labId: 'lab-default' } });
    const role = await prisma.role.findUnique({ where: { code: 'LAB_HEAD' } });
    await prisma.userRole.create({ data: { userId: labHeadId, roleId: role!.id } });
    r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'lh-alerts@lab.local', password: 'pass1234' });
    labHeadToken = r.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'plain-alerts@lab.local', name: 'Plain', password: 'pass1234' });
    const pl = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'plain-alerts@lab.local', password: 'pass1234' });
    plainToken = pl.body.accessToken;

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
      expect(res.body.safetyStock).toBe('100');
    });

    it('409 on duplicate (labId, reagentId)', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '200' });
      expect(res.status).toBe(409);
    });

    it('400 on negative safetyStock', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ labId: 'lab-default', reagentId: 'reagent-alerts', safetyStock: '-1' });
      expect(res.status).toBe(400);
    });

    it('forbidden for plain user', async () => {
      const res = await request(app.getHttpServer())
        .post('/lab-reagent-configs')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ labId: 'lab-default', reagentId, safetyStock: '1' });
      expect(res.status).toBe(403);
    });

    it('GET /lab-reagent-configs returns lab list', async () => {
      const res = await request(app.getHttpServer())
        .get('/lab-reagent-configs?labId=lab-default')
        .set('Authorization', `Bearer ${labHeadToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });
});
