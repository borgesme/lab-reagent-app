import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { expectOk } from './helpers/expect-ok';

describe('Response wrapper (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health 返回 {code:200, msg, data:{...}}', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expectOk(res, (data: any) => {
      expect(data).toHaveProperty('status');
    });
  });

  it('错误未登录请求 → HTTP 200 + code:401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(401);
    expect(res.body.data).toBeNull();
  });

  it('class-validator 失败 → HTTP 200 + code:400 + msg 拼接', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-email', password: '' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(400);
    expect(typeof res.body.msg).toBe('string');
    expect(res.body.msg.length).toBeGreaterThan(0);
  });
});
