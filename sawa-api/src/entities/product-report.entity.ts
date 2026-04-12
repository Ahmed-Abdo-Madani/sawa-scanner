import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('product_report')
export class ProductReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  gtin: string;

  @Column({ type: 'varchar', nullable: true })
  reporter_uid: string | null;


  @Column({ type: 'jsonb' })

  payload: Record<string, any>;

  @Column({ default: 'pending' })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
