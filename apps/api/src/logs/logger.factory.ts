import { join } from 'node:path';
import type { Params } from 'nestjs-pino';
import type { LogsConfig } from './interfaces/logs-config.interface';

const SKIP_AUTO_LOG_PREFIXES = ['/api/v1/health', '/api/docs'];

export function buildPinoOptions(cfg: LogsConfig): Params {
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const file = join(cfg.dir, 'api.log');

  const rollTransport = {
    target: 'pino-roll',
    level: cfg.level,
    options: {
      file,
      frequency: 'daily',
      mkdir: true,
      dateFormat: 'yyyy-MM-dd',
      size: cfg.maxSize,
      limit: { count: cfg.maxFiles },
    },
  };

  const prettyTransport = {
    target: 'pino-pretty',
    level: cfg.level,
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname,req,res,responseTime,context',
      singleLine: false,
      messageFormat: '{ctx} {msg}',
    },
  };

  let transport: any;
  if (isTest) {
    transport = undefined;
  } else if (isProd) {
    transport = rollTransport;
  } else {
    transport = { targets: [prettyTransport, rollTransport] };
  }

  return {
    pinoHttp: {
      level: isTest ? 'silent' : cfg.level,
      autoLogging: {
        ignore: (req) => {
          const url = (req as any).url as string | undefined;
          return !!url && SKIP_AUTO_LOG_PREFIXES.some((p) => url.startsWith(p));
        },
      },
      customProps: (req: any) => ({
        userId: req.user?.sub ?? null,
        ctx: 'HTTP',
      }),
      serializers: {
        req: (req: any) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        }),
        res: (res: any) => ({ statusCode: res.statusCode }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
      transport,
    },
  };
}
