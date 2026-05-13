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
import { ReagentsService } from './reagents.service';
import { CreateReagentDto } from './dto/create-reagent.dto';
import { UpdateReagentDto } from './dto/update-reagent.dto';
import { QueryReagentDto } from './dto/query-reagent.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('reagents')
@ApiBearerAuth()
@Controller('reagents')
export class ReagentsController {
  constructor(private readonly reagents: ReagentsService) {}

  @Get()
  @ApiOperation({ summary: '试剂列表 (支持搜索/筛选)' })
  list(@Query() q: QueryReagentDto) {
    return this.reagents.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: '试剂详情' })
  get(@Param('id') id: string) {
    return this.reagents.get(id);
  }

  @Post()
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'REAGENT_CREATE', entityType: 'Reagent' })
  @ApiOperation({ summary: '新建试剂' })
  create(@Body() dto: CreateReagentDto) {
    return this.reagents.create(dto);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'REAGENT_UPDATE', entityType: 'Reagent' })
  @ApiOperation({ summary: '更新试剂' })
  update(@Param('id') id: string, @Body() dto: UpdateReagentDto) {
    return this.reagents.update(id, dto);
  }

  @Delete(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'REAGENT_DELETE', entityType: 'Reagent' })
  @ApiOperation({ summary: '软删除试剂' })
  remove(@Param('id') id: string) {
    return this.reagents.softDelete(id);
  }
}
