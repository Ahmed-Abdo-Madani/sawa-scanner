import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesService } from './prices.service';
import { PricesController } from './prices.controller';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductPrice, Product])],
  controllers: [PricesController],
  providers: [PricesService],
})
export class PricesModule {}
