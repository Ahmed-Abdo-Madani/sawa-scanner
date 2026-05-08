import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionModule } from '../ingestion/ingestion.module';
import { ProductsModule } from '../products/products.module';
import { Product } from '../entities/product.entity';
import { OffExplorerIndexService } from './off-explorer-index.service';
import { OffExplorerController } from './off-explorer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    IngestionModule,
    ProductsModule,
  ],
  controllers: [OffExplorerController],
  providers: [OffExplorerIndexService],
})
export class OffExplorerModule {}
