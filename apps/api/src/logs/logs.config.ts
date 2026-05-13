import { ConfigService } from '@nestjs/config';
import type { LogsConfig } from './interfaces/logs-config.interface';

export function loadLogsConfig(config: ConfigService): LogsConfig {
  return {
    level: config.get<string>('LOG_LEVEL') ?? 'info',
    dir: config.get<string>('LOG_DIR') ?? './logs',
    maxFiles: Number(config.get<string>('LOG_MAX_FILES') ?? 7),
    maxSize: config.get<string>('LOG_MAX_SIZE') ?? '10m',
  };
}
