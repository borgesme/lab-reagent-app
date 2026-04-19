import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@Query() q: QueryNotificationsDto, @CurrentUser() user: any) {
    return this.svc.listMine(user.sub, q);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(id, user.sub);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: any) {
    return this.svc.markAllRead(user.sub);
  }
}
