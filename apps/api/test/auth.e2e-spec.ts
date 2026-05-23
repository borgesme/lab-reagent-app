import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';
import { resetAdminState } from './helpers/reset-admin';

describe('Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await resetAdminState(prisma);
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
    expect(res.body.code).toBe(200);
    expect(res.body.data.user.email).toBe('alice@lab.local');
  });

  it('POST /auth/login returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@lab.local', password: 'pass1234' });
    const data = expectOk(res);
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
  });

  it('POST /auth/login wrong password returns 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@lab.local', password: 'wrong' });
    expectBizError(res, 401);
  });

  it('GET /auth/me returns current user with roles', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    expectOk(login);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expectOk(me, {
      email: 'admin@lab.local',
      roles: expect.arrayContaining(['SYS_ADMIN']) as any,
    });
  });

  it('GET /auth/me without token returns 401', async () => {
    const me = await request(app.getHttpServer()).get('/auth/me');
    expectBizError(me, 401);
  });

  it('refresh token rotation: 旧 refresh 用一次后再用应 401', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    const oldRefresh = login.body.data.refreshToken;

    const r1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    const r1Data = expectOk(r1);
    expect(r1Data.refreshToken).not.toBe(oldRefresh);

    const r2 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expectBizError(r2, 401);

    const r3 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: r1Data.refreshToken });
    expectOk(r3);
  });

  describe('PATCH /auth/me', () => {
    let access: string;
    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@lab.local', password: 'admin123' });
      access = login.body.data.accessToken;
    });

    it('未登录 → 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .send({ name: '新名字' });
      expectBizError(res, 401);
    });

    it('合法 name → 200 且 body.name 更新', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .send({ name: '管理员-改' });
      const data = expectOk(res);
      expect(data.name).toBe('管理员-改');
      expect(data.email).toBe('admin@lab.local');
    });

    it('空 name → 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .send({ name: '' });
      expectBizError(res, 400);
    });

    it('whitelist 拦截多余字段:email/labId/roles 不变', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .send({
          name: '管理员-再改',
          email: 'pwn@evil.com',
          labId: 'fake-id',
          roles: ['PLAIN_USER'],
        });
      const data = expectOk(res);
      expect(data.email).toBe('admin@lab.local');
      expect(data.roles).toEqual(expect.arrayContaining(['SYS_ADMIN']));
    });
  });

  describe('POST /auth/change-password', () => {
    const initialPwd = 'pw-init-1234';
    const newPwd = 'pw-new-5678';
    let userEmail: string;

    beforeAll(async () => {
      userEmail = `pwd-test-${Date.now()}@lab.local`;
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: userEmail, name: 'PwdTest', password: initialPwd });
      expect(reg.status).toBe(201);
      expect(reg.body.code).toBe(200);
    });

    async function login(password: string) {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password });
    }

    it('当前密码错 → 400, 密码不变', async () => {
      const lg = await login(initialPwd);
      expectOk(lg);
      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${lg.body.data.accessToken}`)
        .send({ currentPassword: 'wrong', newPassword: newPwd });
      expectBizError(res, 400);
      const reLogin = await login(initialPwd);
      expectOk(reLogin);
    });

    it('新密码 < 8 → 400', async () => {
      const lg = await login(initialPwd);
      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${lg.body.data.accessToken}`)
        .send({ currentPassword: initialPwd, newPassword: 'short' });
      expectBizError(res, 400);
    });

    it('成功换密 → 200, 返回新对; 旧 access token 失效; 新密可登录, 旧密不可', async () => {
      const lgOld = await login(initialPwd);
      const oldAccess = lgOld.body.data.accessToken;

      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${oldAccess}`)
        .send({ currentPassword: initialPwd, newPassword: newPwd });
      const data = expectOk(res);
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();

      const decodedNew: any = jwt.decode(data.accessToken);
      const decodedOld: any = jwt.decode(oldAccess);
      expect(decodedNew.ver).toBe(decodedOld.ver + 1);

      const meNew = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${data.accessToken}`);
      expectOk(meNew);

      const meOld = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${oldAccess}`);
      expectBizError(meOld, 401);

      const lgWithOld = await login(initialPwd);
      expectBizError(lgWithOld, 401);
      const lgWithNew = await login(newPwd);
      expectOk(lgWithNew);
    });
  });
});
