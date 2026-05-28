import { Entity, PrimaryGeneratedColumn, Column, Index, UpdateDateColumn } from 'typeorm';

@Entity()
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true, nullable: false })
  firebaseUid: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  originalTransactionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  productId: string | null;

  @Column({ default: 'expired' })
  status: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  purchaseDate: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
