import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Deadline } from './deadline.entity';

export enum DeadlineActivityAction {
  CREATED = 'created',
  UPDATED = 'updated',
  STATUS_CHANGED = 'status_changed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  BREACHED = 'breached',
  NOTIFICATION_SENT = 'notification_sent',
}

@Entity('deadline_activity_logs')
export class DeadlineActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'deadline_id', type: 'uuid', nullable: false })
  deadlineId: string;

  @Column({ type: 'enum', enum: DeadlineActivityAction, nullable: false })
  action: DeadlineActivityAction;

  @Column({ name: 'performed_by', type: 'uuid', nullable: false })
  performedBy: string;

  @Column({ type: 'text', nullable: false })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Deadline, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deadline_id' })
  deadline: Deadline;
}
