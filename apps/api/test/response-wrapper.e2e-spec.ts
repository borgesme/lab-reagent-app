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
});
