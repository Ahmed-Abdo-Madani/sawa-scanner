import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { Store } from '../entities/store.entity';
import { Merchant } from '../entities/merchant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store, Merchant])],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
