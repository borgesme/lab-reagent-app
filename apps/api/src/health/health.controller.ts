import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { RedisService } from '../common/redis/redis.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  @ApiOperation({ summary: '健康检查' })
  check() {
    return {
      status: 'ok',
      redis: this.redis.isReady() ? 'up' : 'down',
    };
  }
}
