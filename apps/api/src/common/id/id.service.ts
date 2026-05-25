import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SnowflakeIdGenerator, resolveSnowflakeWorkerId } from './snowflake';

@Injectable()
export class IdService {
  private readonly generator: SnowflakeIdGenerator;

  constructor(private readonly config: ConfigService) {
    this.generator = new SnowflakeIdGenerator({
      workerId: resolveSnowflakeWorkerId(
        this.config.get<string>('SNOWFLAKE_WORKER_ID'),
        this.config.get<string>('NODE_ENV'),
      ),
    });
  }

  nextId(): string {
    return this.generator.nextId();
  }
}
