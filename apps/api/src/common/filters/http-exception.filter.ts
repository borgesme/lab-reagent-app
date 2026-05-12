import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

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
      return res.status(200).json({ code: status, msg, data: null });
    }

    this.logger.error(exception);
    return res
      .status(200)
      .json({ code: 500, msg: 'internal error', data: null });
  }
}
