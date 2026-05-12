import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_alternative_name')
@Unique(['product_id', 'name'])
export class ProductAlternativeName {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  product_id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  measure: string | null;

  /** Popularity score — number of users who chose this name on barcode-list.com */
  @Column({ type: 'int', default: 0 })
  popularity: number;

  @Column({ type: 'varchar', length: 50, default: 'barcode-list' })
  source: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
