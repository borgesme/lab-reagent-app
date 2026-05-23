import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { REDIS_KEYS } from '../../common/redis/redis.constants';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private redis: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const plainRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: 'PLAIN_USER' },
    });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: { create: [{ roleId: plainRole.id }] },
      },
    });
    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException();
    const roles = user.roles.map((ur) => ur.role.code);
    return this.issueTokens(user.id, roles, user.tokenVersion);
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      labId: u.labId,
      roles: u.roles.map((ur) => ur.role.code),
    };
  }

  async updateMe(userId: string, dto: { name: string }) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name },
    });
    return this.me(userId);
  }

  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException();
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });
    const roles = user.roles.map((ur) => ur.role.code);
    return this.issueTokens(userId, roles, updated.tokenVersion);
  }

  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.deletedAt) throw new UnauthorizedException();
      if (!payload.jti || user.currentRefreshJti !== payload.jti) {
        throw new UnauthorizedException();
      }
      if (payload.ver !== user.tokenVersion) {
        throw new UnauthorizedException();
      }
      return this.issueTokens(payload.sub, payload.roles, user.tokenVersion);
    } catch {
      throw new UnauthorizedException();
    }
  }

  async logout(jti: string | undefined, exp: number | undefined): Promise<{ ok: true }> {
    if (!jti || !exp) return { ok: true };
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return { ok: true };
    await this.redis.set(REDIS_KEYS.blacklist(jti), '1', ttl);
    return { ok: true };
  }

  private async issueTokens(sub: string, roles: string[], ver: number) {
    const accessJti = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub, roles, ver, jti: accessJti },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const refreshJti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub, roles, jti: refreshJti, ver },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    await this.prisma.user.update({
      where: { id: sub },
      data: { currentRefreshJti: refreshJti },
    });
    return { accessToken, refreshToken };
  }
}
