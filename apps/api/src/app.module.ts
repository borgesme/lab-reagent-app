import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LogsModule } from './logs/logs.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LabsModule } from './labs/labs.module';
import { RolesModule } from './roles/roles.module';
import { ReagentsModule } from './reagents/reagents.module';
import { StocksModule } from './stocks/stocks.module';
import { RequestsModule } from './requests/requests.module';
import { LedgerModule } from './ledger/ledger.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PurchasesModule } from './purchases/purchases.module';
import { AlertsModule } from './alerts/alerts.module';
import { ReportsModule } from './reports/reports.module';
import { JwtStrategy } from './common/strategies/jwt.strategy';
import { JwtAuthGuard } from './common/guards/jwt.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LogsModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    LabsModule,
    RolesModule,
    ReagentsModule,
    StocksModule,
    RequestsModule,
    LedgerModule,
    NotificationsModule,
    PurchasesModule,
    AlertsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    JwtStrategy,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
