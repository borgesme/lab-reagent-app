import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.userRole.deleteMany({
      where: { user: { email: 'alice@lab.local' } },
    });
    await prisma.user.deleteMany({ where: { email: 'alice@lab.local' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register creates user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@lab.local', name: 'Alice', password: 'pass1234' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@lab.local');
  });

  it('POST /auth/login returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@lab.local', password: 'pass1234' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('POST /auth/login wrong password returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@lab.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns current user with roles', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    expect(login.status).toBe(200);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      email: 'admin@lab.local',
      roles: expect.arrayContaining(['SYS_ADMIN']),
    });
  });

  it('GET /auth/me without token returns 401', async () => {
    const me = await request(app.getHttpServer()).get('/auth/me');
    expect(me.status).toBe(401);
  });

  it('refresh token rotation: 旧 refresh 用一次后再用应 401', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    const oldRefresh = login.body.refreshToken;

    // 第一次 refresh:成功,得新对
    const r1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(oldRefresh);

    // 同一旧 refresh 再用一次:应 401
    const r2 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(r2.status).toBe(401);

    // 新 refresh 仍可用一次
    const r3 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken });
    expect(r3.status).toBe(200);
  });
});
