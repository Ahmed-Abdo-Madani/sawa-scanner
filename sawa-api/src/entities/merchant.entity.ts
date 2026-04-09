import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name_ar: string;

  @Column({ nullable: true })
  name_en: string;

  @Column({ nullable: true })
  base_url: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ nullable: true })
  data_source_type: string;
}
