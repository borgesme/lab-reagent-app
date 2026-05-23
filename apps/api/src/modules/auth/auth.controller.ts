import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @RateLimit({ scope: 'auth:register:ip', keyBy: 'ip', limit: 5, windowSec: 60 })
  @ApiOperation({ summary: '注册新用户' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ scope: 'auth:login:ip',      keyBy: 'ip',                          limit: 10, windowSec: 60 })
  @RateLimit({ scope: 'auth:login:account', keyBy: 'ip+body', bodyField: 'email', limit: 5,  windowSec: 60 })
  @ApiOperation({ summary: '邮箱密码登录, 返回 access/refresh token' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ scope: 'auth:refresh:ip', keyBy: 'ip', limit: 30, windowSec: 60 })
  @ApiOperation({ summary: '用 refresh token 换新的 access/refresh token' })
  refresh(@Body('refreshToken') token: string) {
    return this.auth.refresh(token);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @RateLimit({ scope: 'auth:logout:ip', keyBy: 'ip', limit: 30, windowSec: 60 })
  @ApiOperation({ summary: '登出, 把当前 access token jti 加黑名单' })
  logout(@Req() req: any) {
    return this.auth.logout(req.user?.jti, req.user?.exp);
  }

  @Get('me')
  @ApiBearerAuth()
  @RateLimit({ scope: 'auth:me:ip', keyBy: 'ip', limit: 120, windowSec: 60 })
  @ApiOperation({ summary: '当前登录用户资料' })
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }

  @Patch('me')
  @ApiBearerAuth()
  @Audit({ action: 'USER_UPDATE_SELF', entityType: 'User' })
  @ApiOperation({ summary: '更新当前用户资料 (姓名)' })
  updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(req.user.sub, dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(200)
  @RateLimit({ scope: 'auth:change-password:ip', keyBy: 'ip', limit: 5, windowSec: 60 })
  @Audit({ action: 'USER_CHANGE_PASSWORD', entityType: 'User' })
  @ApiOperation({ summary: '修改密码, tokenVersion++ 踢其他会话' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, dto);
  }
}
