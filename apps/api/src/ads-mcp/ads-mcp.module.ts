import { Module } from '@nestjs/common';
import { AdPerformanceModule } from '../ad-performance/ad-performance.module';
import { AdsMcpGateway } from './ads-mcp.gateway';

/**
 * Internal Ads MCP — chỉ inject trong Nest (không đăng ký HTTP controller public).
 * AI / ai-ads-manager đọc metrics qua AdsMcpGateway; không gọi Meta/Google API.
 */
@Module({
  imports: [AdPerformanceModule],
  providers: [AdsMcpGateway],
  exports: [AdsMcpGateway],
})
export class AdsMcpModule {}
