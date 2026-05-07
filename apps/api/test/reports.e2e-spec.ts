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
});
