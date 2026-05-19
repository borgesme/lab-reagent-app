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
import { LabsService } from './labs.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { BatchDeleteDto } from './dto/batch-delete.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('labs')
@ApiBearerAuth()
@Roles('SYS_ADMIN')
@Controller('labs')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  @ApiOperation({ summary: '列出全部实验室' })
  list() {
    return this.labs.list();
  }

  @Get('page')
  @ApiOperation({ summary: '实验室分页列表 (pageNum/pageSize)' })
  listPaged(@Query() q: PageQueryDto) {
    return this.labs.listPaged(q);
  }

  @Post()
  @Audit({ action: 'LAB_CREATE', entityType: 'Lab' })
  @ApiOperation({ summary: '新建实验室' })
  create(@Body() dto: CreateLabDto) {
    return this.labs.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'LAB_UPDATE', entityType: 'Lab' })
  @ApiOperation({ summary: '更新实验室' })
  update(@Param('id') id: string, @Body() dto: UpdateLabDto) {
    return this.labs.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'LAB_DELETE', entityType: 'Lab' })
  @ApiOperation({ summary: '软删除实验室' })
  remove(@Param('id') id: string) {
    return this.labs.softDelete(id);
  }

  @Post('batch-delete')
  @HttpCode(200)
  @Audit({ action: 'LAB_BATCH_DELETE', entityType: 'Lab' })
  @ApiOperation({ summary: '批量软删除实验室 (事务全或无)' })
  batchDelete(@Body() dto: BatchDeleteDto) {
    return this.labs.batchDelete(dto.ids);
  }
}
