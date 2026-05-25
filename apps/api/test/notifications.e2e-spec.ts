import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { MailerService } from '../src/modules/notifications/mailer.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

const expectSnowflakeId = (id: unknown) => {
  expect(typeof id).toBe('string');
  expect(id).toMatch(/^\d+$/);
};

describe('Notifications', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let mailer: MailerService;
  let aliceToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    mailer = app.get(MailerService);

    await prisma.notification.deleteMany({});

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice-notif@lab.local', name: 'Alice', password: 'pass1234' });
    const aLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice-notif@lab.local', password: 'pass1234' });
    aliceToken = aLogin.body.data.accessToken;
    aliceId = (await prisma.user.findUnique({ where: { email: 'alice-notif@lab.local' } }))!.id;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bob-notif@lab.local', name: 'Bob', password: 'pass1234' });
    const bLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'bob-notif@lab.local', password: 'pass1234' });
    bobToken = bLogin.body.data.accessToken;
    bobId = (await prisma.user.findUnique({ where: { email: 'bob-notif@lab.local' } }))!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notifications returns only own items', async () => {
    const notification = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_LOW_STOCK',
      title: 'low',
      body: 'low stock',
    });
    expectSnowflakeId(notification.id);
    await notifications.create({
      recipientId: bobId,
      type: 'ALERT_LOW_STOCK',
      title: 'low',
      body: 'low stock',
    });
    const res = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${aliceToken}`);
    const data = expectOk(res);
    expect(data.every((n: any) => n.recipientId === aliceId)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /notifications?unreadOnly=true filters read items', async () => {
    const n = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_EXPIRING',
      title: 't',
      body: 'b',
    });
    await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
    const res = await request(app.getHttpServer())
      .get('/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${aliceToken}`);
    const data = expectOk(res);
    expect(data.every((x: any) => x.readAt === null)).toBe(true);
  });

  it('POST /notifications/:id/read marks read and 403 on other user', async () => {
    const n = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_RECONCILE',
      title: 't',
      body: 'b',
    });
    const ok = await request(app.getHttpServer())
      .post(`/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expectOk(ok);
    const db = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(db?.readAt).not.toBeNull();

    const n2 = await notifications.create({
      recipientId: bobId,
      type: 'ALERT_RECONCILE',
      title: 't',
      body: 'b',
    });
    const denied = await request(app.getHttpServer())
      .post(`/notifications/${n2.id}/read`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expectBizError(denied, 403);
  });

  it('POST /notifications/read-all marks all own unread', async () => {
    await notifications.create({ recipientId: aliceId, type: 'ALERT_LOW_STOCK', title: 'a', body: 'a' });
    await notifications.create({ recipientId: aliceId, type: 'ALERT_LOW_STOCK', title: 'b', body: 'b' });
    const res = await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${aliceToken}`);
    expectOk(res);
    const remaining = await prisma.notification.count({
      where: { recipientId: aliceId, readAt: null },
    });
    expect(remaining).toBe(0);
  });

  it('createIfAbsent dedupes same day by recipient+type+payload.reagentId', async () => {
    await prisma.notification.deleteMany({ where: { recipientId: aliceId } });
    const first = await notifications.createIfAbsent({
      recipientId: aliceId,
      type: 'ALERT_LOW_STOCK',
      title: 't',
      body: 'b',
      payload: { reagentId: 'r1' },
    });
    const second = await notifications.createIfAbsent({
      recipientId: aliceId,
      type: 'ALERT_LOW_STOCK',
      title: 't',
      body: 'b',
      payload: { reagentId: 'r1' },
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('mailer.send sets emailedAt on notification', async () => {
    const n = await notifications.create({
      recipientId: aliceId,
      type: 'ALERT_EXPIRING',
      title: 't',
      body: 'b',
    });
    await mailer.send({ notificationId: n.id, to: 'alice-notif@lab.local', subject: 't', body: 'b' });
    const db = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(db?.emailedAt).not.toBeNull();
  });

  it('unauthenticated GET returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/notifications');
    expectBizError(res, 401);
  });
});
