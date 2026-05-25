import {
  SnowflakeIdGenerator,
  resolveSnowflakeWorkerId,
} from './snowflake';

describe('SnowflakeIdGenerator', () => {
  it('returns a decimal string id', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 1,
      now: () => 1_800_000_000_000,
    });

    expect(generator.nextId()).toMatch(/^\d+$/);
  });

  it('generates unique ids for consecutive calls in the same millisecond', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 2,
      now: () => 1_800_000_000_000,
    });

    const ids = Array.from({ length: 10 }, () => generator.nextId());

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('increments sequence within the same millisecond', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 3,
      now: () => 1_800_000_000_000,
    });

    const first = BigInt(generator.nextId());
    const second = BigInt(generator.nextId());

    expect(second - first).toBe(1n);
  });

  it('resets sequence when the timestamp advances', () => {
    const timestamps = [1_800_000_000_000, 1_800_000_000_000, 1_800_000_000_001];
    const generator = new SnowflakeIdGenerator({
      workerId: 4,
      now: () => timestamps.shift() ?? 1_800_000_000_001,
    });

    generator.nextId();
    const sameMillisecond = BigInt(generator.nextId());
    const nextMillisecond = BigInt(generator.nextId());

    expect(sameMillisecond & 0xfffn).toBe(1n);
    expect(nextMillisecond & 0xfffn).toBe(0n);
  });

  it('accepts worker id lower and upper bounds', () => {
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 0,
          now: () => 1_800_000_000_000,
        }),
    ).not.toThrow();
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 1023,
          now: () => 1_800_000_000_000,
        }),
    ).not.toThrow();
  });

  it('rejects worker ids outside the 10-bit range', () => {
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: -1,
          now: () => 1_800_000_000_000,
        }),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 1024,
          now: () => 1_800_000_000_000,
        }),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
    expect(
      () =>
        new SnowflakeIdGenerator({
          workerId: 1.5,
          now: () => 1_800_000_000_000,
        }),
    ).toThrow(/SNOWFLAKE_WORKER_ID_INVALID/);
  });

  it('waits for the next millisecond when sequence overflows', () => {
    let calls = 0;
    const generator = new SnowflakeIdGenerator({
      workerId: 5,
      now: () => {
        calls += 1;
        return calls <= 4097 ? 1_800_000_000_000 : 1_800_000_000_001;
      },
    });

    for (let i = 0; i < 4096; i += 1) {
      generator.nextId();
    }
    const overflowId = BigInt(generator.nextId());

    expect(overflowId & 0xfffn).toBe(0n);
  });

  it('throws when the clock moves backward', () => {
    const timestamps = [1_800_000_000_001, 1_800_000_000_000];
    const generator = new SnowflakeIdGenerator({
      workerId: 6,
      now: () => timestamps.shift() ?? 1_800_000_000_000,
    });

    generator.nextId();

    expect(() => generator.nextId()).toThrow(/SNOWFLAKE_CLOCK_MOVED_BACKWARD/);
  });
});

describe('resolveSnowflakeWorkerId', () => {
  it('defaults to 0 outside production when the env var is missing', () => {
    expect(resolveSnowflakeWorkerId(undefined, 'development')).toBe(0);
    expect(resolveSnowflakeWorkerId('', 'test')).toBe(0);
  });

  it('requires an explicit worker id in production', () => {
    expect(() => resolveSnowflakeWorkerId(undefined, 'production')).toThrow(
      /SNOWFLAKE_WORKER_ID_REQUIRED/,
    );
    expect(() => resolveSnowflakeWorkerId('', 'production')).toThrow(
      /SNOWFLAKE_WORKER_ID_REQUIRED/,
    );
  });

  it('parses a valid configured worker id', () => {
    expect(resolveSnowflakeWorkerId('7', 'production')).toBe(7);
  });

  it('rejects invalid configured worker ids', () => {
    expect(() => resolveSnowflakeWorkerId('abc', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
    expect(() => resolveSnowflakeWorkerId('1.5', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
    expect(() => resolveSnowflakeWorkerId('-1', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
    expect(() => resolveSnowflakeWorkerId('1024', 'development')).toThrow(
      /SNOWFLAKE_WORKER_ID_INVALID/,
    );
  });

  it('encodes the worker id in generated ids', () => {
    const generator = new SnowflakeIdGenerator({
      workerId: 7,
      now: () => 1_800_000_000_000,
    });

    const id = BigInt(generator.nextId());

    expect((id >> 12n) & 0x3ffn).toBe(7n);
  });
});
