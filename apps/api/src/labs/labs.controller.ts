import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { LabsService } from './labs.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Roles('SYS_ADMIN')
@Controller('labs')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  list() {
    return this.labs.list();
  }

  @Post()
  @Audit({ action: 'LAB_CREATE', entityType: 'Lab' })
  create(@Body() dto: CreateLabDto) {
    return this.labs.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'LAB_UPDATE', entityType: 'Lab' })
  update(@Param('id') id: string, @Body() dto: UpdateLabDto) {
    return this.labs.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'LAB_DELETE', entityType: 'Lab' })
  remove(@Param('id') id: string) {
    return this.labs.softDelete(id);
  }
}
