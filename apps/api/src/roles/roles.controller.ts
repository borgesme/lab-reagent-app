import { Controller, Get } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Roles } from '../common/decorators/roles.decorator';

@Roles('SYS_ADMIN', 'LAB_HEAD', 'REAGENT_ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.list();
  }
}
