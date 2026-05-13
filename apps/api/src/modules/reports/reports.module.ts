import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsageTrendController } from './usage-trend.controller';
import { UsageTrendService } from './usage-trend.service';
import { InventoryTurnoverController } from './inventory-turnover.controller';
import { InventoryTurnoverService } from './inventory-turnover.service';
import { PurchaseAmountController } from './purchase-amount.controller';
import { PurchaseAmountService } from './purchase-amount.service';
import { ControlledAuditController } from './controlled-audit.controller';
import { ControlledAuditService } from './controlled-audit.service';
import { ReportScopeGuard } from './guards/report-scope.guard';

@Module({
  controllers: [
    UsageTrendController,
    InventoryTurnoverController,
    PurchaseAmountController,
    ControlledAuditController,
  ],
  providers: [
    UsageTrendService,
    InventoryTurnoverService,
    PurchaseAmountService,
    ControlledAuditService,
    { provide: APP_GUARD, useClass: ReportScopeGuard },
  ],
})
export class ReportsModule {}
