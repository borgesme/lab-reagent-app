import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Post()
  @Audit({ action: 'PURCHASE_CREATE', entityType: 'PurchaseRequest' })
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user);
  }

  @Get('mine')
  mine(@CurrentUser() user: any) {
    return this.svc.listMine(user);
  }

  @Get()
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  list(@Query('labId') labId: string | undefined, @CurrentUser() user: any) {
    return this.svc.listLab(user, labId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'PURCHASE_CANCEL', entityType: 'PurchaseRequest' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.cancel(id, user);
  }
}
