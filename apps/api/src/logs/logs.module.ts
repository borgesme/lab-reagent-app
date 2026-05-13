import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoOptions } from './logger.factory';
import { loadLogsConfig } from './logs.config';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildPinoOptions(loadLogsConfig(config)),
    }),
  ],
  exports: [LoggerModule],
})
export class LogsModule {}
