import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PricesService } from './prices.service';
import { PricesController } from './prices.controller';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';
import Redis from 'ioredis';

@Module({
  imports: [TypeOrmModule.forFeature([ProductPrice, Product])],
  controllers: [PricesController],
  providers: [
    PricesService,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        });
      },
    },
  ],
  exports: [PricesService, 'REDIS_CLIENT'],
})
export class PricesModule {}
