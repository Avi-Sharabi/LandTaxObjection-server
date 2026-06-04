import { DeadlineStatus } from './entities/deadline.entity';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';

export const TERMINAL_STATUSES = [DeadlineStatus.COMPLETED, DeadlineStatus.CANCELLED];

export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Case statuses where the statutory objection has already been filed or the case is resolved.
// These cases display as COMPLETED in the deadline dashboard regardless of due date.
export const DEADLINE_COMPLETED_CASE_STATUSES: DisputeStatus[] = [
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.VG_RESPONSE_RECEIVED,
  DisputeStatus.VG_APPROVED,
  DisputeStatus.VG_DECLINED,
  DisputeStatus.FOR_REVIEW,
  DisputeStatus.OUTCOME_RECEIVED,
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];
