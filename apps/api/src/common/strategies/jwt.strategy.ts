import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private cfg: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }
  async validate(payload: {
    sub: string;
    roles: string[];
    ver?: number;
    jti?: string;
    exp?: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const allowLegacy = this.cfg.get('JWT_ALLOW_LEGACY_CLAIMS') === '1';
    if (payload.ver === undefined) {
      if (!allowLegacy) throw new UnauthorizedException();
    } else if (payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    return {
      sub: payload.sub,
      roles: payload.roles,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
