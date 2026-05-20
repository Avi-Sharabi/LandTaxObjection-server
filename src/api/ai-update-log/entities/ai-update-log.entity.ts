import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ai_update_logs')
export class AiUpdateLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  action: string;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  @Column({ name: 'performed_by', type: 'uuid', nullable: false })
  performedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
