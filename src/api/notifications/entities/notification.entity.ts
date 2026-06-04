import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  APPROVAL_REQUESTED = 'approval_requested',
  APPROVAL_REMINDER = 'approval_reminder',
  APPROVAL_REMINDER_MAX_REACHED = 'approval_reminder_max_reached',
  VG_FOLLOW_UP_SENT = 'vg_follow_up_sent',
  VG_RESPONSE_RECEIVED = 'vg_response_received',
  DEADLINE_DUE_SOON = 'deadline_due_soon',
  DEADLINE_AT_RISK = 'deadline_at_risk',
  DEADLINE_BREACHED = 'deadline_breached',
  DEADLINE_EXTENSION_REQUESTED = 'deadline_extension_requested',
  DEADLINE_EXTENSION_REVIEWED = 'deadline_extension_reviewed',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  @Column({ type: 'text', nullable: false })
  type: NotificationType;

  @Column({ type: 'text', nullable: false })
  message: string;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId: string | null;

  @Column({ name: 'read', type: 'boolean', nullable: false, default: false })
  read: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
