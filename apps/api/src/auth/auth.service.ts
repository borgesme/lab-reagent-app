import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
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
    return this.issueTokens(user.id, roles);
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

  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      return this.issueTokens(payload.sub, payload.roles);
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async issueTokens(sub: string, roles: string[]) {
    const accessToken = await this.jwt.signAsync(
      { sub, roles },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub, roles },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    return { accessToken, refreshToken };
  }
}
