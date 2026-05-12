import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { QueryConfigDto } from './dto/query-config.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('lab-reagent-configs')
export class AlertsController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_UPSERT', entityType: 'LabReagentConfig' })
  @ApiOperation({ summary: '创建实验室-试剂安全库存/到期提醒配置' })
  create(@Body() dto: UpsertConfigDto, @CurrentUser() user: any) {
    return this.config.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: '查询配置列表 (按实验室/试剂筛选)' })
  list(@Query() q: QueryConfigDto, @CurrentUser() user: any) {
    return this.config.list(q, user);
  }

  @Patch(':id')
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_UPSERT', entityType: 'LabReagentConfig' })
  @ApiOperation({ summary: '更新配置' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertConfigDto>,
    @CurrentUser() user: any,
  ) {
    return this.config.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_DELETE', entityType: 'LabReagentConfig' })
  @ApiOperation({ summary: '删除配置' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.config.remove(id, user);
  }
}
