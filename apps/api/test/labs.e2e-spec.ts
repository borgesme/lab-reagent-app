import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { expectOk } from './helpers/expect-ok';

describe('Labs & Roles', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('create lab', async () => {
    const r = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '有机化学实验室', building: '化工楼3楼' });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    expect(r.body.data.name).toBe('有机化学实验室');
  });

  it('list labs', async () => {
    const r = await request(app.getHttpServer())
      .get('/labs')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('list roles', async () => {
    const r = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBe(5);
  });
});
