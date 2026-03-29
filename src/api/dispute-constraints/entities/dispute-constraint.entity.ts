import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { DisputeCase } from '../../dispute-cases/entities/dispute-case.entity';
import { ConstraintFile } from '../../constraint-files/entities/constraint-file.entity';
import { ConstraintType } from './constraint-type.enum';

export { ConstraintType };

@Entity('dispute_constraints')
export class DisputeConstraint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'dispute_id' })
  dispute_id: string;

  @Column({ type: 'enum', enum: ConstraintType, nullable: false, name: 'constraint_type' })
  constraint_type: ConstraintType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  // Relations
  @ManyToOne(() => DisputeCase, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute: DisputeCase;

  @OneToMany(() => ConstraintFile, (file) => file.dispute_constraint, { cascade: false })
  files: ConstraintFile[];
}
