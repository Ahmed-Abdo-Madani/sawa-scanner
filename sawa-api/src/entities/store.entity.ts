import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Merchant } from './merchant.entity';

@Entity()
@Index('UQ_store_platform_branch_uuid', ['platform', 'platform_branch_uuid'], {
  unique: true,
})
@Index('IDX_store_merchant_id', ['merchant_id'])
@Index('IDX_store_city_district', ['city_slug', 'district_slug'])
@Index('IDX_store_vertical', ['vertical'])
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Merchant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Column()
  merchant_id: string;

  @Column()
  platform: string;

  @Column({ nullable: true })
  platform_branch_id: string;

  @Column()
  platform_branch_uuid: string;

  @Column({ nullable: true })
  vertical: string;

  @Column()
  city_slug: string;

  @Column({ nullable: true })
  city_name_ar: string;

  @Column({ nullable: true })
  city_name_en: string;

  @Column({ nullable: true })
  district_slug: string;

  @Column({ nullable: true })
  district_name_ar: string;

  @Column({ nullable: true })
  district_name_en: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ nullable: true })
  source_url: string;

  @Column({ type: 'timestamp' })
  last_seen_at: Date;

  @Column({ default: true })
  is_active: boolean;
}
