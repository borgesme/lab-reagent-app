import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@Roles('SYS_ADMIN', 'LAB_HEAD', 'REAGENT_ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOperation({ summary: '列出所有可分配的角色' })
  list() {
    return this.roles.list();
  }
}
