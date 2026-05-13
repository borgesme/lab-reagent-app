import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { expectOk } from './helpers/expect-ok';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    const data = expectOk(res);
    expect(data).toEqual({ status: 'ok' });
  });
});
