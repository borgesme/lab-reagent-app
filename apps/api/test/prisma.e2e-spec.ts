import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('PrismaService', () => {
  let svc: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    svc = mod.get(PrismaService);
    await svc.$connect();
  });
  afterAll(async () => {
    await svc.$disconnect();
  });

  it('connects to db', async () => {
    const result = await svc.$queryRaw`SELECT 1 as n`;
    expect(result).toBeDefined();
  });
});
