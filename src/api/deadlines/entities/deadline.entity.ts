import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DeadlineEntityType {
  DISPUTE_CASE = 'dispute_case',
}

export enum DeadlineType {
  STATUTORY_OBJECTION = 'statutory_objection',
}

export enum DeadlineStatus {
  UPCOMING = 'upcoming',
  DUE_SOON = 'due_soon',
  AT_RISK = 'at_risk',
  OVERDUE = 'overdue',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DeadlinePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('deadlines')
export class Deadline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: false })
  entityId: string;

  @Column({ name: 'entity_type', type: 'enum', enum: DeadlineEntityType, nullable: false })
  entityType: DeadlineEntityType;

  @Column({ name: 'deadline_type', type: 'enum', enum: DeadlineType, nullable: false })
  deadlineType: DeadlineType;

  @Column({ type: 'text', nullable: false })
  title: string;

  @Index()
  @Column({ type: 'enum', enum: DeadlineStatus, nullable: false, default: DeadlineStatus.UPCOMING })
  status: DeadlineStatus;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: false })
  dueDate: Date;

  @Column({ name: 'assigned_owner_id', type: 'uuid', nullable: false })
  assignedOwnerId: string;

  @Column({ type: 'enum', enum: DeadlinePriority, nullable: false, default: DeadlinePriority.MEDIUM })
  priority: DeadlinePriority;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: false })
  createdById: string;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'assigned_owner_id' })
  assignedOwner: User;
}
