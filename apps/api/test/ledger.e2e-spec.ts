import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Ledger', () => {
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

    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = aLogin.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'ledger-plain@lab.local',
        name: 'Plain',
        password: 'pass1234',
      });
    const pLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ledger-plain@lab.local', password: 'pass1234' });
    plainToken = pLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('plain user forbidden', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger')
      .set('Authorization', `Bearer ${plainToken}`);
    expectBizError(r, 403);
  });

  it('admin JSON returns only controlled rows', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger?format=json')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(Array.isArray(data)).toBe(true);
    for (const row of data) {
      expect(['CONTROLLED']).toContain(row.hazardLevel);
    }
  });

  it('admin CSV returns text/csv with BOM', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger?format=csv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    const firstLine = r.text.replace(/^﻿/, '').split('\n')[0];
    expect(firstLine).toContain('date');
    expect(firstLine).toContain('reagentName');
    expect(firstLine).toContain('signed');
  });

  it('date range filter', async () => {
    const r = await request(app.getHttpServer())
      .get('/controlled-ledger?format=json&from=2100-01-01&to=2100-12-31')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data).toEqual([]);
  });

  describe('snapshots', () => {
    it('service.generateMonthly upserts snapshot', async () => {
      const svc = app.get<any>(
        require('../src/ledger/ledger.service').LedgerService,
      );
      const snap = await svc.generateMonthly('2100-03', 'lab-default');
      expect(snap.labId).toBe('lab-default');
      expect(snap.yearMonth).toBe('2100-03');
      expect(typeof snap.csvContent).toBe('string');
      expect(snap.csvContent.charCodeAt(0)).toBe(0xfeff);

      const again = await svc.generateMonthly('2100-03', 'lab-default');
      expect(again.id).toBe(snap.id);
    });

    it('GET /controlled-ledger/snapshots lists by desc', async () => {
      const r = await request(app.getHttpServer())
        .get('/controlled-ledger/snapshots')
        .set('Authorization', `Bearer ${adminToken}`);
      const data = expectOk(r);
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /controlled-ledger/snapshots/:id returns CSV', async () => {
      const svc = app.get<any>(
        require('../src/ledger/ledger.service').LedgerService,
      );
      const snap = await svc.generateMonthly('2100-04', 'lab-default');
      const r = await request(app.getHttpServer())
        .get(`/controlled-ledger/snapshots/${snap.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/csv/);
      expect(r.text.charCodeAt(0)).toBe(0xfeff);
    });
  });
});
