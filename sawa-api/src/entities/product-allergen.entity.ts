import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';

@Entity()
@Index('UQ_product_allergen', ['product_id', 'allergen_key'], { unique: true })
export class ProductAllergen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  allergen_key: string;

  @Column({ nullable: true })
  name_ar: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ nullable: true })
  source: string; // 'scrape' | 'ocr' | 'openfoodfacts'

  @ManyToOne(() => Product, (product) => product.allergens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Index()
  @Column()
  product_id: string;
}
