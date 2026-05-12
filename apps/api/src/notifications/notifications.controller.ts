import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '查询当前用户的站内信列表' })
  list(@Query() q: QueryNotificationsDto, @CurrentUser() user: any) {
    return this.svc.listMine(user.sub, q);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: '将某条站内信标记为已读' })
  read(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(id, user.sub);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: '一键全部已读' })
  readAll(@CurrentUser() user: any) {
    return this.svc.markAllRead(user.sub);
  }
}
