import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({ summary: '领用申请列表 (按 scope/status 筛选)' })
  list(@Query() q: QueryRequestDto, @CurrentUser() user: any) {
    return this.requests.list(q, user);
  }

  @Get(':id')
  @ApiOperation({ summary: '领用申请详情' })
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requests.get(id, user);
  }

  @Post()
  @Audit({ action: 'REQUEST_CREATE', entityType: 'Request' })
  @ApiOperation({ summary: '提交领用申请' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: any) {
    return this.requests.create(dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'REQUEST_CANCEL', entityType: 'Request' })
  @ApiOperation({ summary: '撤销自己的 PENDING 领用申请' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requests.cancel(id, user);
  }
}
