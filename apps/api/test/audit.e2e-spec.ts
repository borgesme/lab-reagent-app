import { Test } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Audit } from '../src/common/decorators/audit.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { PrismaService } from '../src/prisma/prisma.service';

@Public()
@Controller('test-audit')
class TestAuditController {
  @Post()
  @Audit({ action: 'TEST_CREATE', entityType: 'Test' })
  create() {
    return { ok: true };
  }
}

describe('Audit interceptor', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestAuditController],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.auditLog.deleteMany({ where: { action: 'TEST_CREATE' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('writes AuditLog on decorated route', async () => {
    await request(app.getHttpServer()).post('/test-audit').expect(201);
    // interceptor writes async; wait briefly
    await new Promise((r) => setTimeout(r, 200));
    const logs = await prisma.auditLog.findMany({
      where: { action: 'TEST_CREATE' },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].entityType).toBe('Test');
  });
});
