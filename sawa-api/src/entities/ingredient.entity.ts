import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class Ingredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name_ar: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ nullable: true })
  e_number: string;

  @Column({ nullable: true })
  inci_name: string;

  @Column({ nullable: true })
  sfda_status: string;

  @Column({ nullable: true })
  restriction_note: string;

  @ManyToOne(() => Product, product => product.ingredients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Index()
  @Column()
  product_id: string;
}
