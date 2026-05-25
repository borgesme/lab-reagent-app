import { ConfigService } from '@nestjs/config';
import { IdService } from './id.service';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('IdService', () => {
  it('returns a decimal string id', () => {
    const service = new IdService(
      config({
        NODE_ENV: 'test',
        SNOWFLAKE_WORKER_ID: '1',
      }),
    );

    expect(service.nextId()).toMatch(/^\d+$/);
  });

  it('defaults worker id to 0 outside production', () => {
    const service = new IdService(
      config({
        NODE_ENV: 'test',
        SNOWFLAKE_WORKER_ID: undefined,
      }),
    );

    const id = BigInt(service.nextId());

    expect((id >> 12n) & 0x3ffn).toBe(0n);
  });

  it('reads worker id from SNOWFLAKE_WORKER_ID', () => {
    const service = new IdService(
      config({
        NODE_ENV: 'test',
        SNOWFLAKE_WORKER_ID: '9',
      }),
    );

    const id = BigInt(service.nextId());

    expect((id >> 12n) & 0x3ffn).toBe(9n);
  });

  it('requires SNOWFLAKE_WORKER_ID in production', () => {
    expect(
      () =>
        new IdService(
          config({
            NODE_ENV: 'production',
            SNOWFLAKE_WORKER_ID: undefined,
          }),
        ),
    ).toThrow(/SNOWFLAKE_WORKER_ID_REQUIRED/);
  });

  it('rejects invalid SNOWFLAKE_WORKER_ID values', () => {
    expect(
      () =>
        new IdService(
          config({
            NODE_ENV: 'test',
            SNOWFLAKE_WORKER_ID: '1024',
          }),
        ),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
  });
});
