import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { NutritionFact } from './nutrition-fact.entity';
import { Ingredient } from './ingredient.entity';
import { ProductPrice } from './product-price.entity';
import { ProductImage } from './product-image.entity';
import { ProductAllergen } from './product-allergen.entity';

@Entity()
@Index(['brand_normalized', 'net_weight_value', 'net_unit'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true, where: '"gtin" IS NOT NULL' })
  @Column({ type: 'varchar', unique: true, nullable: true })
  gtin: string | null;

  @Index('IDX_product_hs_product_id', { unique: true, where: '"hs_product_id" IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true, unique: true })
  hs_product_id: string | null;

  @Column({ type: 'text', nullable: true })
  hs_product_url: string | null;

  @Column({ nullable: true })
  name_ar: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ nullable: true })
  brand: string;

  @Index()
  @Column({ nullable: true })
  brand_normalized: string;

  @Column({ nullable: true })
  name_normalized: string;

  @Index()
  @Column({ nullable: true, length: 4, type: 'varchar' })
  gtin_prefix: string | null;

  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  subcategory: string;

  @Column({ nullable: true })
  description_ar: string;

  @Column({ nullable: true })
  description_en: string;

  @Column({ nullable: true })
  sfda_registration_status: string;

  @Column({ type: 'boolean', nullable: true })
  halal_certified: boolean | null;

  @Column({ type: 'integer', nullable: true })
  nova_group: number | null;

  @Column({ type: 'char', length: 1, nullable: true })
  nutri_score_grade: string | null;

  @Column({ type: 'integer', nullable: true })
  sfda_npm_score: number | null;

  @Column({ type: 'double precision', nullable: true })
  net_weight_value: number;

  @Column({ nullable: true })
  net_unit: string;

  @Column({ type: 'simple-array', nullable: true })
  allergen_tags: string[];

  @Column({ type: 'simple-array', nullable: true })
  ingredient_tags: string[];

  @Column({ nullable: true })
  image_front_url: string;

  @Column({ nullable: true })
  image_nutrition_url: string;

  @Column({ type: 'boolean', default: false })
  nutrition_data_complete: boolean;

  @Column({ default: 'off' })
  data_source: string;

  @Column({ type: 'float', default: 0 })
  data_completeness_score: number;

  @Column({ type: 'simple-array', nullable: true })
  off_categories_tags: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  off_countries_tags: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => NutritionFact, (nutritionFact) => nutritionFact.product)
  nutritionFact: NutritionFact;

  @OneToMany(() => Ingredient, (ingredient) => ingredient.product)
  ingredients: Ingredient[];

  @OneToMany(() => ProductAllergen, (allergen) => allergen.product)
  allergens: ProductAllergen[];

  @OneToMany(() => ProductPrice, (price) => price.product)
  prices: ProductPrice[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images: ProductImage[];
}
