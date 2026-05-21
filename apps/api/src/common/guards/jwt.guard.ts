import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { REDIS_KEYS } from '../redis/redis.constants';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private cfg: ConfigService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const ok = (await super.canActivate(ctx)) as boolean;
    if (!ok) return false;

    const req = ctx.switchToHttp().getRequest();
    const jti: string | undefined = req.user?.jti;
    if (!jti) {
      const allowLegacy = this.cfg.get('JWT_ALLOW_LEGACY_CLAIMS') === '1';
      if (!allowLegacy) throw new UnauthorizedException();
      return true;
    }
    const hit = await this.redis.get(REDIS_KEYS.blacklist(jti));
    if (hit === '1') {
      throw new UnauthorizedException('token revoked');
    }
    return true;
  }
}
