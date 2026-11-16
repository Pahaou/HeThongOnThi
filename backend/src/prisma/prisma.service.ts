import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        // Mặc định của pg chỉ 10 kết nối: hàng trăm thí sinh vào thi cùng lúc sẽ xếp hàng chờ
        max: Number(config.get('DB_POOL_SIZE') ?? 20),
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
