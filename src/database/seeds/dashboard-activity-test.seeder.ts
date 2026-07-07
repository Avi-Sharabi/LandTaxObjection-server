import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { AuditAction } from '../../api/audit-log/entities/audit-log.entity';

const logger = new Logger('DashboardActivityTestSeeder');

// Reuses case IDs already created by cases-pagination.seeder.ts — run that seeder first.
interface ActivitySeed {
  caseId: string;
  action: AuditAction;
  hoursAgo: number;
  lodgmentReferenceNumber: string | null;
  metadata: Record<string, unknown> | null;
}

const ACTIVITIES: ActivitySeed[] = [
  {
    caseId: 'b4000000-0000-0000-0000-000000000009',
    action: AuditAction.SUBMITTED_TO_VG,
    hoursAgo: 1,
    lodgmentReferenceNumber: 'LR-SEED-PAG-009',
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000020',
    action: AuditAction.VG_FOLLOW_UP_SENT,
    hoursAgo: 3,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000004',
    action: AuditAction.CASE_ADVANCED_TO_APPRAISAL,
    hoursAgo: 5,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000017',
    action: AuditAction.APPRAISAL_SUBMITTED,
    hoursAgo: 24,
    lodgmentReferenceNumber: null,
    metadata: { decisionOutcome: 'ADVISORY' },
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000006',
    action: AuditAction.OBJECTION_PACKAGE_SENT,
    hoursAgo: 36,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000008',
    action: AuditAction.OBJECTION_PACKAGE_APPROVED,
    hoursAgo: 48,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000013',
    action: AuditAction.CASE_CLOSED_NO_OBJECTION,
    hoursAgo: 60,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000011',
    action: AuditAction.VG_OUTCOME_APPROVED,
    hoursAgo: 72,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000021',
    action: AuditAction.VG_OUTCOME_NEEDS_REVIEW,
    hoursAgo: 84,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000003',
    action: AuditAction.DOCUMENT_UPLOADED,
    hoursAgo: 96,
    lodgmentReferenceNumber: null,
    metadata: { documentName: 'Land Tax Assessment Notice.pdf' },
  },
  // ── Extra activity for pagination testing (20 more, 30 total) ──────────────
  {
    caseId: 'b4000000-0000-0000-0000-000000000001',
    action: AuditAction.SUBMITTED_TO_VG,
    hoursAgo: 6,
    lodgmentReferenceNumber: 'LR-SEED-PAG-001',
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000002',
    action: AuditAction.VG_FOLLOW_UP_SENT,
    hoursAgo: 8,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000005',
    action: AuditAction.CASE_ADVANCED_TO_APPRAISAL,
    hoursAgo: 12,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000007',
    action: AuditAction.CASE_CLOSED_NO_OBJECTION,
    hoursAgo: 18,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000010',
    action: AuditAction.OBJECTION_PACKAGE_SENT,
    hoursAgo: 30,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000012',
    action: AuditAction.OBJECTION_PACKAGE_APPROVED,
    hoursAgo: 42,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000014',
    action: AuditAction.APPRAISAL_SUBMITTED,
    hoursAgo: 54,
    lodgmentReferenceNumber: null,
    metadata: { decisionOutcome: 'OBJECTION' },
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000015',
    action: AuditAction.VG_OUTCOME_APPROVED,
    hoursAgo: 66,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000016',
    action: AuditAction.VG_OUTCOME_DECLINED,
    hoursAgo: 78,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000018',
    action: AuditAction.VG_OUTCOME_NEEDS_REVIEW,
    hoursAgo: 90,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000019',
    action: AuditAction.DOCUMENT_UPLOADED,
    hoursAgo: 102,
    lodgmentReferenceNumber: null,
    metadata: { documentName: 'Objection Evidence Pack.pdf' },
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000022',
    action: AuditAction.SUBMITTED_TO_VG,
    hoursAgo: 114,
    lodgmentReferenceNumber: 'LR-SEED-PAG-022',
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000023',
    action: AuditAction.VG_FOLLOW_UP_SENT,
    hoursAgo: 126,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000024',
    action: AuditAction.CASE_ADVANCED_TO_APPRAISAL,
    hoursAgo: 138,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000025',
    action: AuditAction.CASE_CLOSED_NO_OBJECTION,
    hoursAgo: 150,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000026',
    action: AuditAction.OBJECTION_PACKAGE_SENT,
    hoursAgo: 162,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000027',
    action: AuditAction.OBJECTION_PACKAGE_APPROVED,
    hoursAgo: 174,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000028',
    action: AuditAction.APPRAISAL_SUBMITTED,
    hoursAgo: 186,
    lodgmentReferenceNumber: null,
    metadata: { decisionOutcome: 'ADVISORY' },
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000029',
    action: AuditAction.VG_OUTCOME_APPROVED,
    hoursAgo: 198,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
  {
    caseId: 'b4000000-0000-0000-0000-000000000030',
    action: AuditAction.VG_OUTCOME_DECLINED,
    hoursAgo: 210,
    lodgmentReferenceNumber: null,
    metadata: null,
  },
];

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

export async function seedDashboardActivityTest(dataSource: DataSource): Promise<void> {
  const assessor = await dataSource.getRepository(User).findOneBy({ email: 'pol.imbing@ymlgroup.com.au' });
  if (!assessor) {
    throw new Error('[DashboardActivityTestSeeder] pol.imbing not found — run seedUsers() first.');
  }

  for (const activity of ACTIVITIES) {
    const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [activity.caseId]);
    if (!existingCase) {
      logger.warn(`  Skipped ${activity.action} — case ${activity.caseId} not found (run seedCasesPagination() first)`);
      continue;
    }

    const [existing] = await dataSource.query(
      `SELECT id FROM audit_logs WHERE case_id = $1 AND action = $2`,
      [activity.caseId, activity.action],
    );

    if (existing) {
      await dataSource.query(`UPDATE audit_logs SET created_at = $1 WHERE id = $2`, [
        hoursAgo(activity.hoursAgo),
        existing.id,
      ]);
      logger.log(`  Refreshed timestamp: ${activity.action} on ${activity.caseId}`);
      continue;
    }

    await dataSource.query(
      `INSERT INTO audit_logs (action, performed_by, case_id, lodgment_reference_number, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        activity.action,
        assessor.id,
        activity.caseId,
        activity.lodgmentReferenceNumber,
        activity.metadata ? JSON.stringify(activity.metadata) : null,
        hoursAgo(activity.hoursAgo),
      ],
    );
    logger.log(`  Seeded activity: ${activity.action} on ${activity.caseId}`);
  }
}
