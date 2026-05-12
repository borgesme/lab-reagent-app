import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { RESPONSE_MSG_KEY } from '../decorators/response-msg.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const msg =
      this.reflector.get<string>(RESPONSE_MSG_KEY, ctx.getHandler()) ?? 'ok';
    const res = ctx.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) return data;
        if (Buffer.isBuffer(data)) return data;
        if (typeof data === 'string') return data;
        if (res.getHeader && res.getHeader('content-disposition')) return data;
        return { code: 200, msg, data: data ?? null };
      }),
    );
  }
}
