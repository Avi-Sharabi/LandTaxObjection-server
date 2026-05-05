import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Stores every inbound email detected as a potential VG response.
 *
 * Unmatched emails (case_id = null) and unanalysed emails (ai_outcome = null)
 * are the primary input queues for the future AI agent.
 */
@Entity('vg_email_inbox')
export class VgEmailInbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Graph API message ID — unique idempotency key. */
  @Column({ type: 'text', unique: true })
  message_id: string;

  /** Linked dispute case once the email is matched; null if unmatched. */
  @Column({ type: 'uuid', nullable: true })
  case_id: string | null;

  @Column({ type: 'text' })
  sender_address: string;

  @Column({ type: 'text', nullable: true })
  subject: string | null;

  /** Full email body (HTML or plain text) — primary input for AI analysis. */
  @Column({ type: 'text', nullable: true })
  body_content: string | null;

  @Column({ type: 'text', nullable: true })
  body_content_type: string | null;

  /** First ~500 chars of plain text — quick scan without parsing HTML. */
  @Column({ type: 'text', nullable: true })
  body_preview: string | null;

  @Column({ type: 'timestamptz' })
  received_at: Date;

  /** Set when the monitor successfully links this email to a case. */
  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;

  // ── AI agent fields ──────────────────────────────────────────────────────────
  // Select WHERE ai_outcome IS NULL to find emails awaiting AI analysis.

  /** 'approved' | 'rejected' | 'needs_review' — set by AI agent. */
  @Column({ type: 'text', nullable: true })
  ai_outcome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ai_analyzed_at: Date | null;

  /** Full AI response payload stored for audit and debugging. */
  @Column({ type: 'jsonb', nullable: true })
  ai_raw_response: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
