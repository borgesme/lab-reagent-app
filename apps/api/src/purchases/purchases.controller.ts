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
import { PurchasesService } from './purchases.service';
import { BatchesService } from './batches.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { MergeBatchDto } from './dto/merge-batch.dto';
import { ApproveBatchDto } from './dto/approve-batch.dto';
import { ReceiptBatchDto } from './dto/receipt-batch.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly svc: PurchasesService,
    private readonly batches: BatchesService,
  ) {}

  @Post()
  @Audit({ action: 'PURCHASE_CREATE', entityType: 'PurchaseRequest' })
  @ApiOperation({ summary: '提交采购申请 (PurchaseRequest)' })
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user);
  }

  @Get('mine')
  @ApiOperation({ summary: '我的采购申请列表' })
  mine(@CurrentUser() user: any) {
    return this.svc.listMine(user);
  }

  @Get()
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @ApiOperation({ summary: '实验室视角的采购申请列表' })
  list(@Query('labId') labId: string | undefined, @CurrentUser() user: any) {
    return this.svc.listLab(user, labId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit({ action: 'PURCHASE_CANCEL', entityType: 'PurchaseRequest' })
  @ApiOperation({ summary: '撤销自己的 PENDING 采购申请' })
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.cancel(id, user);
  }

  @Post('batches')
  @Roles('REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_BATCH_CREATE', entityType: 'PurchaseBatch' })
  @ApiOperation({ summary: '合并多条申请为采购批次 (PurchaseBatch)' })
  merge(@Body() dto: MergeBatchDto, @CurrentUser() user: any) {
    return this.batches.merge(dto, user);
  }

  @Post('batches/:id/approve')
  @HttpCode(200)
  @Roles('LAB_HEAD', 'SYS_ADMIN')
  @Audit({ action: 'PURCHASE_BATCH_APPROVE', entityType: 'PurchaseBatch' })
  @ApiOperation({ summary: '审批 (APPROVE/REJECT) 采购批次' })
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
  @ApiOperation({ summary: '采购到货入库 (PurchaseReceipt + ReagentStock)' })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiptBatchDto,
    @CurrentUser() user: any,
  ) {
    return this.batches.receive(id, dto, user);
  }
}
