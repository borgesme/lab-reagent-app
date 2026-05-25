export interface SnowflakeIdGeneratorOptions {
  workerId: number;
  epoch?: number;
  now?: () => number;
}

export const SNOWFLAKE_DEFAULT_EPOCH = 1_735_689_600_000;

const WORKER_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_WORKER_ID = Number((1n << WORKER_ID_BITS) - 1n);
const MAX_SEQUENCE = Number((1n << SEQUENCE_BITS) - 1n);
const WORKER_ID_SHIFT = SEQUENCE_BITS;
const TIMESTAMP_SHIFT = WORKER_ID_BITS + SEQUENCE_BITS;

export class SnowflakeIdGenerator {
  private readonly workerId: number;
  private readonly epoch: number;
  private readonly now: () => number;
  private lastTimestamp = -1;
  private sequence = 0;

  constructor(options: SnowflakeIdGeneratorOptions) {
    this.workerId = options.workerId;
    this.epoch = options.epoch ?? SNOWFLAKE_DEFAULT_EPOCH;
    this.now = options.now ?? Date.now;
    assertValidWorkerId(this.workerId);
  }

  nextId(): string {
    let timestamp = this.currentTimestamp();

    if (timestamp < this.lastTimestamp) {
      throw new Error(
        `SNOWFLAKE_CLOCK_MOVED_BACKWARD: current timestamp ${timestamp} is before last timestamp ${this.lastTimestamp}`,
      );
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & MAX_SEQUENCE;
      if (this.sequence === 0) {
        timestamp = this.waitUntilNextTimestamp(timestamp);
      }
    } else {
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    return (
      (BigInt(timestamp - this.epoch) << TIMESTAMP_SHIFT) |
      (BigInt(this.workerId) << WORKER_ID_SHIFT) |
      BigInt(this.sequence)
    ).toString();
  }

  private currentTimestamp(): number {
    return this.now();
  }

  private waitUntilNextTimestamp(timestamp: number): number {
    let nextTimestamp = this.currentTimestamp();
    while (nextTimestamp <= timestamp) {
      nextTimestamp = this.currentTimestamp();
    }
    return nextTimestamp;
  }
}

export function resolveSnowflakeWorkerId(raw: string | undefined, nodeEnv: string | undefined): number {
  if (raw === undefined || raw === '') {
    if (nodeEnv === 'production') {
      throw new Error('SNOWFLAKE_WORKER_ID_REQUIRED: configure SNOWFLAKE_WORKER_ID in production');
    }
    return 0;
  }

  const workerId = Number(raw);
  assertValidWorkerId(workerId);
  return workerId;
}

function assertValidWorkerId(workerId: number): void {
  if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
    throw new Error(`SNOWFLAKE_WORKER_ID_INVALID: workerId must be an integer between 0 and ${MAX_WORKER_ID}`);
  }
}
