import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
    adminToken = r.body.accessToken;
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
    expect(r.body.email).toBe('bob@lab.local');
  });

  it('admin lists users', async () => {
    const r = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
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
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(r.status).toBe(403);
  });
});
