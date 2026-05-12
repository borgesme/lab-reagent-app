import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LabsService } from './labs.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';

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
}
