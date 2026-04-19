import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { Merchant } from './merchant.entity';
import { Store } from './store.entity';

@Entity()
export class ProductPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'float' })
  price_sar_incl_vat: number;

  @Column()
  currency: string;

  @Column()
  in_stock: boolean;

  @Column({ nullable: true })
  source_url: string;

  @Column({ type: 'float', nullable: true })
  promo_price_sar: number | null;

  @Column({ type: 'float', nullable: true })
  unit_price_sar: number | null;

  @Column({ nullable: true })
  unit_price_unit: string;

  @Index()
  @Column({ type: 'timestamp' })
  scraped_at: Date;

  @ManyToOne(() => Product, (product) => product.prices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Index()
  @Column()
  product_id: string;

  @ManyToOne(() => Merchant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Index()
  @Column()
  merchant_id: string;

  @ManyToOne(() => Store, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'store_id' })
  store?: Store | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  store_id: string | null;
}
