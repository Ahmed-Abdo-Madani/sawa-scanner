import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class NutritionFact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'float', nullable: true })
  energy_kcal: number;

  @Column({ type: 'float', nullable: true })
  fat_g: number;

  @Column({ type: 'float', nullable: true })
  saturated_fat_g: number;

  @Column({ type: 'float', nullable: true })
  carbs_g: number;

  @Column({ type: 'float', nullable: true })
  sugars_g: number;

  @Column({ type: 'float', nullable: true })
  fiber_g: number;

  @Column({ type: 'float', nullable: true })
  protein_g: number;

  @Column({ type: 'float', nullable: true })
  sodium_mg: number;

  @Column({ nullable: true })
  serving_size_g: number;

  @OneToOne(() => Product, product => product.nutritionFact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  product_id: string;
}
