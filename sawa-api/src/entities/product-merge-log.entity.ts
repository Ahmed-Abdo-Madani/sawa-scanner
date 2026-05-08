import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('product_merge_log')
export class ProductMergeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  winner_product_id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  loser_product_id: string;

  @Column()
  winner_gtin: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  loser_gtin: string | null;

  @Column()
  reason: string; // 'scan_twin_merge' | 'manual_merge' | 'gtin_assignment' | 'off_backfill'

  @Column()
  triggered_by: string; // 'admin' | 'off_backfill_job' | 'manual'

  @Column({ nullable: true })
  actor_uid: string;

  @Column({ type: 'jsonb', default: {} })
  payload: any;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
