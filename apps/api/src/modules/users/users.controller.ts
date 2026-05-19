import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { BatchDeleteDto } from './dto/batch-delete.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Roles('SYS_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: '用户列表 (仅 SYS_ADMIN)' })
  list() {
    return this.users.list();
  }

  @Get('page')
  @ApiOperation({ summary: '用户分页列表 (pageNum/pageSize)' })
  listPaged(@Query() q: PageQueryDto) {
    return this.users.listPaged(q);
  }

  @Post()
  @Audit({ action: 'USER_CREATE', entityType: 'User' })
  @ApiOperation({ summary: '管理员创建用户' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'USER_UPDATE', entityType: 'User' })
  @ApiOperation({ summary: '更新用户 (角色/姓名/实验室等)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'USER_DELETE', entityType: 'User' })
  @ApiOperation({ summary: '软删除用户' })
  remove(@Param('id') id: string) {
    return this.users.softDelete(id);
  }

  @Post('batch-delete')
  @HttpCode(200)
  @Audit({ action: 'USER_BATCH_DELETE', entityType: 'User' })
  @ApiOperation({ summary: '批量软删除用户 (事务全或无)' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.users.batchDelete(dto.ids);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Audit({ action: 'USER_RESET_PASSWORD', entityType: 'User' })
  @ApiOperation({ summary: '管理员重置用户密码, 返回新密码' })
  resetPassword(@Param('id') id: string) {
    return this.users.resetPassword(id);
  }
}
