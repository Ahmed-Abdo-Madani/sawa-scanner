import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('sfda_prohibited_ingredients')
export class SfdaProhibitedIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  @Index()
  e_number: string;

  @Column({ nullable: true })
  inci_name: string;

  @Column()
  name_en: string;

  @Column({ nullable: true })
  name_ar: string;

  @Column({
    type: 'enum',
    enum: ['prohibited', 'restricted'],
    default: 'prohibited',
  })
  sfda_status: 'prohibited' | 'restricted';

  @Column({ type: 'text', nullable: true })
  restriction_note: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
