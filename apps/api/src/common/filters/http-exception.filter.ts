import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('Exception');
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse();
    const req = http.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      let msg: string;
      if (typeof r === 'string') {
        msg = r;
      } else if (r && typeof r === 'object') {
        const m = (r as any).message;
        msg = Array.isArray(m) ? m.join('; ') : String(m ?? exception.message);
      } else {
        msg = exception.message;
      }
      if (status >= 500) {
        this.logger.error(
          { err: exception, reqId: req?.id, url: req?.url, method: req?.method },
          'unhandled http exception',
        );
      }
      return res.status(200).json({ code: status, msg, data: null });
    }

    this.logger.error(
      { err: exception, reqId: req?.id, url: req?.url, method: req?.method },
      'unhandled exception',
    );
    return res
      .status(200)
      .json({ code: 500, msg: 'internal error', data: null });
  }
}
