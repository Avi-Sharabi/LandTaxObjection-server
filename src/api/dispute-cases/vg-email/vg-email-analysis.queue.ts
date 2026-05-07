export const VG_EMAIL_ANALYSIS_QUEUE = 'vg-email-analysis';

export interface VgEmailAnalysisJobData {
  messageId: string;
  senderAddress: string;
  subject: string | null;
  bodyContent: string | null;
  bodyContentType: string | null;
  receivedAt: string;
}

export type VgEmailOutcome = 'approved' | 'declined' | 'needs_review';

export interface PropertyAnalysisResult {
  pid: string | null;
  address: string | null;
  outcome: VgEmailOutcome;
  confidence: number;
  reasoning: string;
  caseId: string | null;
}

export interface VgEmailAnalysisJobResult {
  results: Array<{ outcome: VgEmailOutcome; disputeCaseId?: string; pid?: string | null }>;
}
