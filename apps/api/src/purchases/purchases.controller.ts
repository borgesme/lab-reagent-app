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
import { BatchesService } from './batches.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { MergeBatchDto } from './dto/merge-batch.dto';
import { ApproveBatchDto } from './dto/approve-batch.dto';
import { ReceiptBatchDto } from './dto/receipt-batch.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly svc: PurchasesService,
    private readonly batches: BatchesService,
  ) {}

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

  @Post('batches')
  @Roles('REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_BATCH_CREATE', entityType: 'PurchaseBatch' })
  merge(@Body() dto: MergeBatchDto, @CurrentUser() user: any) {
    return this.batches.merge(dto, user);
  }

  @Post('batches/:id/approve')
  @HttpCode(200)
  @Roles('LAB_HEAD', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_BATCH_APPROVE', entityType: 'PurchaseBatch' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.batches.approve(id, dto, user);
  }

  @Post('batches/:id/receipt')
  @Roles('REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_RECEIVE', entityType: 'PurchaseReceipt' })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiptBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.batches.receive(id, dto, user);
  }
}
