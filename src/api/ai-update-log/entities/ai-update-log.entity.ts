import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AiUpdateAction {
  AI_DB_WRITE = 'AI_DB_WRITE',
}

@Entity('ai_update_logs')
export class AiUpdateLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  action: AiUpdateAction;

  @Column({ name: 'performed_by', type: 'uuid', nullable: false })
  performedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
