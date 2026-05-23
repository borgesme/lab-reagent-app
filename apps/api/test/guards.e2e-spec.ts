import { Test } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Roles } from '../src/common/decorators/roles.decorator';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { expectOk, expectBizError } from './helpers/expect-ok';
import { resetAdminState } from './helpers/reset-admin';

@Controller('test-admin')
class TestAdminController {
  @Get()
  @Roles('SYS_ADMIN')
  onlyAdmin(@CurrentUser() u: any) {
    return { sub: u.sub };
  }
}

describe('Guards', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAdminController],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const prisma = app.get(PrismaService);
    await resetAdminState(prisma);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    accessToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('missing token → 401', async () => {
    const r = await request(app.getHttpServer()).get('/test-admin');
    expectBizError(r, 401);
  });

  it('admin token → 200', async () => {
    const r = await request(app.getHttpServer())
      .get('/test-admin')
      .set('Authorization', `Bearer ${accessToken}`);
    const data = expectOk(r);
    expect(data.sub).toBeDefined();
  });
});
