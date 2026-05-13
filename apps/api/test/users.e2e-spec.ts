import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Users', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.userRole.deleteMany({
      where: { user: { email: { in: ['bob@lab.local', 'carol@lab.local'] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['bob@lab.local', 'carol@lab.local'] } },
    });
    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = r.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin creates user', async () => {
    const r = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'bob@lab.local',
        name: 'Bob',
        password: 'pass1234',
        roles: ['PLAIN_USER'],
      });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    expect(r.body.data.email).toBe('bob@lab.local');
  });

  it('admin lists users', async () => {
    const r = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(Array.isArray(data)).toBe(true);
  });

  it('non-admin cannot list', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'carol@lab.local', name: 'Carol', password: 'pass1234' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'carol@lab.local', password: 'pass1234' });
    const r = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expectBizError(r, 403);
  });

  it('reset-password 后旧 access token 立即 401', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'bob@lab.local', password: 'pass1234' });
    const bobToken = expectOk(loginRes).accessToken;

    const me1 = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${bobToken}`);
    expectOk(me1);

    const bob = await prisma.user.findUnique({
      where: { email: 'bob@lab.local' },
    });
    expect(bob).toBeTruthy();

    const reset = await request(app.getHttpServer())
      .post(`/users/${bob!.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectOk(reset);

    const me2 = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${bobToken}`);
    expectBizError(me2, 401);
  });

  it('admin patches user name + roles', async () => {
    const bob = await prisma.user.findUnique({
      where: { email: 'bob@lab.local' },
    });
    expect(bob).toBeTruthy();
    const r = await request(app.getHttpServer())
      .patch(`/users/${bob!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bob Renamed', roles: ['LAB_HEAD'] });
    const data = expectOk(r);
    expect(data.name).toBe('Bob Renamed');

    const fresh = await prisma.user.findUnique({
      where: { id: bob!.id },
      include: { roles: { include: { role: true } } },
    });
    expect(fresh!.roles.map((ur) => ur.role.code)).toEqual(['LAB_HEAD']);
  });

  it('admin patches non-existent user → 404', async () => {
    const r = await request(app.getHttpServer())
      .patch('/users/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' });
    expectBizError(r, 404);
  });

  it('admin deletes(soft) user', async () => {
    const r = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'erin@lab.local',
        name: 'Erin',
        password: 'pass1234',
        roles: ['PLAIN_USER'],
      });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    const erinId = r.body.data.id;

    const del = await request(app.getHttpServer())
      .delete(`/users/${erinId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectOk(del);

    const erin = await prisma.user.findUnique({ where: { id: erinId } });
    expect(erin?.deletedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const listData = expectOk(list);
    expect(listData.find((u: any) => u.id === erinId)).toBeUndefined();

    await prisma.userRole.deleteMany({ where: { userId: erinId } });
    await prisma.user.delete({ where: { id: erinId } });
  });

  it('admin resets password 返回 8 位字符串', async () => {
    const bob = await prisma.user.findUnique({
      where: { email: 'bob@lab.local' },
    });
    const r = await request(app.getHttpServer())
      .post(`/users/${bob!.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.tempPassword).toMatch(/^[A-Za-z]{4}[0-9]{4}$/);
  });

  it('reset-password 不存在用户 → 404', async () => {
    const r = await request(app.getHttpServer())
      .post('/users/non-existent-id/reset-password')
      .set('Authorization', `Bearer ${adminToken}`);
    expectBizError(r, 404);
  });
});
