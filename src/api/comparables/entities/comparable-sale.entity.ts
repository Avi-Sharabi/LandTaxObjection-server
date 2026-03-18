import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';
import { User } from '../../users/entities/user.entity';

@Entity('comparable_sales')
export class ComparableSale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_case_id' })
  dispute_case_id: string;

  @Column({ type: 'text', nullable: false })
  address: string;

  @Column({ type: 'date', nullable: false })
  sale_date: Date;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: false })
  sale_price: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  land_area_sqm: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: false, name: 'created_by_id' })
  created_by_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Relations
  @ManyToOne(() => DisputeCase, (disputeCase) => disputeCase.comparables, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dispute_case_id' })
  dispute_case: DisputeCase;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;
}
