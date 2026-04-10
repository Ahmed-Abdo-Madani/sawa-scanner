import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToOne, OneToMany } from 'typeorm';
import { NutritionFact } from './nutrition-fact.entity';
import { Ingredient } from './ingredient.entity';
import { ProductPrice } from './product-price.entity';
import { ProductImage } from './product-image.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  gtin: string;

  @Column({ nullable: true })
  name_ar: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  category: string;

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => NutritionFact, nutritionFact => nutritionFact.product)
  nutritionFact: NutritionFact;

  @OneToMany(() => Ingredient, ingredient => ingredient.product)
  ingredients: Ingredient[];

  @OneToMany(() => ProductPrice, price => price.product)
  prices: ProductPrice[];

  @OneToMany(() => ProductImage, image => image.product)
  images: ProductImage[];
}
