import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StocksService } from './stocks.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryStockDto } from './dto/query-stock.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiTags('stocks')
@ApiBearerAuth()
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Get()
  @ApiOperation({ summary: '库存批次列表 (按试剂/实验室筛选)' })
  list(@Query() q: QueryStockDto, @CurrentUser() user: any) {
    return this.stocks.list(q, user);
  }

  @Post()
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'STOCK_CREATE', entityType: 'ReagentStock' })
  @ApiOperation({ summary: '新建库存批次' })
  create(@Body() dto: CreateStockDto, @CurrentUser() user: any) {
    return this.stocks.create(dto, user);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'STOCK_UPDATE', entityType: 'ReagentStock' })
  @ApiOperation({ summary: '更新库存批次 (数量/位置/到期等)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
    @CurrentUser() user: any,
  ) {
    return this.stocks.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('SYS_ADMIN', 'REAGENT_ADMIN')
  @Audit({ action: 'STOCK_DELETE', entityType: 'ReagentStock' })
  @ApiOperation({ summary: '软删除库存批次' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.stocks.softDelete(id, user);
  }
}
