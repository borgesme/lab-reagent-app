import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Query() q: QueryRequestDto, @CurrentUser() user: any) {
    return this.requests.list(q, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requests.get(id, user);
  }

  @Post()
  @Audit({ action: 'REQUEST_CREATE', entityType: 'Request' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: any) {
    return this.requests.create(dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'REQUEST_CANCEL', entityType: 'Request' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requests.cancel(id, user);
  }
}
