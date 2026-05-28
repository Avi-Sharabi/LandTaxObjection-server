import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Notification, NotificationType } from 'src/api/notifications/entities/notification.entity';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

// ─── ID scheme ────────────────────────────────────────────────────────────────
// f1… → clients   f2… → properties   f3… → assessment_documents
// f4… → valuation_notices   f5… → dispute_cases   f6… → notifications

const POL_EMAIL = 'pol.imbing@ymlgroup.com.au';

// ─── Dispute cases ─────────────────────────────────────────────────────────────
// All four cases are AWAITING_CLIENT_APPROVAL to exercise the full reminder cycle:
//   Case 1 → reminder_count 0  (no reminder sent yet)
//   Case 2 → reminder_count 1  (1st reminder sent)
//   Case 3 → reminder_count 2  (2nd reminder sent)
//   Case 4 → reminder_count 3  (max reached — manual follow-up required)

interface DisputeCaseSeed {
  clientId:                   string;
  propertyId:                 string;
  assessmentDocumentId:       string;
  valuationNoticeId:          string;
  disputeCaseId:              string;
  clientName:                 string;
  address:                    string;
  suburb:                     string;
  pid:                        string;
  caseReference:              string;
  assessedValue:              number;
  appraisedValue:             number;
  reminder_count:             number;
  client_approval_requested_at: string;       // ISO string — when the package was first sent
  last_reminder_sent_at:      string | null;  // ISO string or null
}

const DISPUTE_CASES: DisputeCaseSeed[] = [
  {
    clientId:                   'f1000000-0000-0000-0000-000000000001',
    propertyId:                 'f2000000-0000-0000-0000-000000000002',
    assessmentDocumentId:       'f3000000-0000-0000-0000-000000000003',
    valuationNoticeId:          'f4000000-0000-0000-0000-000000000004',
    disputeCaseId:              'f5000000-0000-0000-0000-000000000001',
    clientName:                 'Notification Client 1 — Chatswood',
    address:                    '1 NOTIF ST CHATSWOOD',
    suburb:                     'Chatswood',
    pid:                        '9000001',
    caseReference:              'LTD-2026-NOTIF-001',
    assessedValue:              820_000,
    appraisedValue:             860_000,
    reminder_count:             0,
    client_approval_requested_at: '2026-04-02T00:00:00Z', // package sent, no reminder yet
    last_reminder_sent_at:      null,
  },
  {
    clientId:                   'f1000000-0000-0000-0000-000000000002',
    propertyId:                 'f2000000-0000-0000-0000-000000000002',
    assessmentDocumentId:       'f3000000-0000-0000-0000-000000000002',
    valuationNoticeId:          'f4000000-0000-0000-0000-000000000002',
    disputeCaseId:              'f5000000-0000-0000-0000-000000000002',
    clientName:                 'Notification Client 2 — North Sydney',
    address:                    '2 NOTIF ST NORTH SYDNEY',
    suburb:                     'North Sydney',
    pid:                        '9000002',
    caseReference:              'LTD-2026-NOTIF-002',
    assessedValue:              1_450_000,
    appraisedValue:             1_520_000,
    reminder_count:             1,
    client_approval_requested_at: '2026-03-20T00:00:00Z',
    last_reminder_sent_at:      '2026-03-26T22:00:00Z', // 1 reminder sent
  },
  {
    clientId:                   'f1000000-0000-0000-0000-000000000003',
    propertyId:                 'f2000000-0000-0000-0000-000000000003',
    assessmentDocumentId:       'f3000000-0000-0000-0000-000000000003',
    valuationNoticeId:          'f4000000-0000-0000-0000-000000000003',
    disputeCaseId:              'f5000000-0000-0000-0000-000000000003',
    clientName:                 'Notification Client 3 — Manly',
    address:                    '3 NOTIF ST MANLY',
    suburb:                     'Manly',
    pid:                        '9000003',
    caseReference:              'LTD-2026-NOTIF-003',
    assessedValue:              2_100_000,
    appraisedValue:             2_200_000,
    reminder_count:             2,
    client_approval_requested_at: '2026-03-10T00:00:00Z',
    last_reminder_sent_at:      '2026-04-01T22:00:00Z', // 2 reminders sent
  },
  {
    clientId:                   'f1000000-0000-0000-0000-000000000004',
    propertyId:                 'f2000000-0000-0000-0000-000000000004',
    assessmentDocumentId:       'f3000000-0000-0000-0000-000000000004',
    valuationNoticeId:          'f4000000-0000-0000-0000-000000000004',
    disputeCaseId:              'f5000000-0000-0000-0000-000000000004',
    clientName:                 'Notification Client 4 — Bondi',
    address:                    '4 NOTIF ST BONDI',
    suburb:                     'Bondi',
    pid:                        '9000004',
    caseReference:              'LTD-2026-NOTIF-004',
    assessedValue:              3_400_000,
    appraisedValue:             3_600_000,
    reminder_count:             3,
    client_approval_requested_at: '2026-02-20T00:00:00Z',
    last_reminder_sent_at:      '2026-04-07T22:00:00Z', // max reminders reached
  },
];

// ─── Notifications ─────────────────────────────────────────────────────────────
// All notifications are focused on the approval reminder follow-up lifecycle.
// 20 unread, 4 read.

const NOTIFICATIONS: Array<{
  id:      string;
  type:    NotificationType;
  message: string;
  caseId:  string | null;
  read:    boolean;
  readAt:  Date | null;
}> = [
  // ── Case 1 (reminder_count=0) — package just sent, no follow-up yet ─────────
  {
    id:      'f6000000-0000-0000-0000-000000000001',
    type:    NotificationType.APPROVAL_REQUESTED,
    message: `Follow-up needed: objection package sent to client for ${DISPUTE_CASES[0].caseReference} on 2 Apr 2026. No response received yet.`,
    caseId:  DISPUTE_CASES[0].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000002',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder due: ${DISPUTE_CASES[0].caseReference} client has not responded after 7 days. Consider sending a follow-up.`,
    caseId:  DISPUTE_CASES[0].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000003',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `No client response for ${DISPUTE_CASES[0].caseReference}. Automatic reminder will be sent if no action is taken today.`,
    caseId:  DISPUTE_CASES[0].disputeCaseId,
    read:    false,
    readAt:  null,
  },

  // ── Case 2 (reminder_count=1) — 1 reminder sent, follow-up pending ──────────
  {
    id:      'f6000000-0000-0000-0000-000000000004',
    type:    NotificationType.APPROVAL_REQUESTED,
    message: `Follow-up needed: objection package sent to client for ${DISPUTE_CASES[1].caseReference} on 20 Mar 2026. Awaiting client sign-off.`,
    caseId:  DISPUTE_CASES[1].disputeCaseId,
    read:    true,
    readAt:  new Date('2026-03-20T08:05:00Z'),
  },
  {
    id:      'f6000000-0000-0000-0000-000000000005',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder 1 of 3 sent for ${DISPUTE_CASES[1].caseReference} on 26 Mar 2026. Client has still not approved the objection package.`,
    caseId:  DISPUTE_CASES[1].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000006',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Follow-up required: ${DISPUTE_CASES[1].caseReference} is awaiting client approval. 2 reminders remaining before manual escalation.`,
    caseId:  DISPUTE_CASES[1].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000007',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Client for ${DISPUTE_CASES[1].caseReference} has not responded to the approval request or the first reminder. Please follow up directly.`,
    caseId:  DISPUTE_CASES[1].disputeCaseId,
    read:    false,
    readAt:  null,
  },

  // ── Case 3 (reminder_count=2) — 2 reminders sent, urgent follow-up ──────────
  {
    id:      'f6000000-0000-0000-0000-000000000008',
    type:    NotificationType.APPROVAL_REQUESTED,
    message: `Follow-up needed: objection package sent to client for ${DISPUTE_CASES[2].caseReference} on 10 Mar 2026. No response received.`,
    caseId:  DISPUTE_CASES[2].disputeCaseId,
    read:    true,
    readAt:  new Date('2026-03-10T08:05:00Z'),
  },
  {
    id:      'f6000000-0000-0000-0000-000000000009',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder 1 of 3 sent for ${DISPUTE_CASES[2].caseReference} on 17 Mar 2026. Client has not yet approved.`,
    caseId:  DISPUTE_CASES[2].disputeCaseId,
    read:    true,
    readAt:  new Date('2026-03-17T08:10:00Z'),
  },
  {
    id:      'f6000000-0000-0000-0000-000000000010',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder 2 of 3 sent for ${DISPUTE_CASES[2].caseReference} on 1 Apr 2026. Only 1 automated reminder remaining.`,
    caseId:  DISPUTE_CASES[2].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000011',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Urgent follow-up: ${DISPUTE_CASES[2].caseReference} client has ignored 2 reminders. Reach out directly to avoid missing the deadline.`,
    caseId:  DISPUTE_CASES[2].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000012',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Action required: ${DISPUTE_CASES[2].caseReference} is at risk. Client approval is overdue — consider calling the client directly.`,
    caseId:  DISPUTE_CASES[2].disputeCaseId,
    read:    false,
    readAt:  null,
  },

  // ── Case 4 (reminder_count=3) — max reached, manual follow-up required ──────
  {
    id:      'f6000000-0000-0000-0000-000000000013',
    type:    NotificationType.APPROVAL_REQUESTED,
    message: `Follow-up needed: objection package sent to client for ${DISPUTE_CASES[3].caseReference} on 20 Feb 2026. Client has not responded.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000014',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder 1 of 3 sent for ${DISPUTE_CASES[3].caseReference} on 27 Feb 2026. No client response.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000015',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder 2 of 3 sent for ${DISPUTE_CASES[3].caseReference} on 6 Mar 2026. Client has not approved after two follow-ups.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000016',
    type:    NotificationType.APPROVAL_REMINDER,
    message: `Reminder 3 of 3 sent for ${DISPUTE_CASES[3].caseReference} on 7 Apr 2026. This was the final automated reminder.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000017',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `Max reminders reached for ${DISPUTE_CASES[3].caseReference}. No further automated follow-ups will be sent — manual intervention required.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000018',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `Escalation required: ${DISPUTE_CASES[3].caseReference} client has not responded after 3 reminders. Please contact the client directly to obtain approval.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000019',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `Overdue approval: ${DISPUTE_CASES[3].caseReference} has been awaiting client sign-off since 20 Feb 2026. Statutory deadline at risk.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000020',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `Final notice: ${DISPUTE_CASES[3].caseReference} requires immediate follow-up. All automated reminders exhausted — no further emails will be sent to the client.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000021',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `Deadline risk: ${DISPUTE_CASES[3].caseReference} client approval is critically overdue. Review case and contact client or escalate to a senior accountant.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000022',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `Case ${DISPUTE_CASES[3].caseReference} is at high risk of missing the statutory deadline. Immediate manual follow-up with client is required.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000023',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `No client approval received for ${DISPUTE_CASES[3].caseReference} despite 3 reminders. Recommend phone follow-up and case review with the team.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
  {
    id:      'f6000000-0000-0000-0000-000000000024',
    type:    NotificationType.APPROVAL_REMINDER_MAX_REACHED,
    message: `${DISPUTE_CASES[3].caseReference} approval window is closing. If client does not respond within 48 hours, the objection package may need to be reissued.`,
    caseId:  DISPUTE_CASES[3].disputeCaseId,
    read:    false,
    readAt:  null,
  },
];

const logger = new Logger('NotificationSeeder');

async function seedDisputeCasesForNotifications(
  dataSource: DataSource,
  accountantId: string,
): Promise<void> {
  const clientRepo = dataSource.getRepository(Client);

  for (const c of DISPUTE_CASES) {
    // ── Client ─────────────────────────────────────────────────────────────────
    const existingClient = await clientRepo.findOneBy({ id: c.clientId });
    if (!existingClient) {
      await clientRepo.save(
        clientRepo.create({
          id:                     c.clientId,
          name:                   c.clientName,
          email:                  POL_EMAIL,
          status:                 ClientStatus.ACTIVE,
          assigned_accountant_id: accountantId,
        }),
      );
      logger.log(`  Seeded client:           ${c.clientName}`);
    } else {
      logger.log(`  Skipped client:          ${c.clientName} (exists)`);
    }

    // ── Property ───────────────────────────────────────────────────────────────
    const [existingProperty] = await dataSource.query(
      `SELECT id FROM properties WHERE id = $1`, [c.propertyId],
    );
    if (!existingProperty) {
      await dataSource.query(`
        INSERT INTO properties
            (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [c.propertyId, c.clientId, c.address, c.suburb, 'NSW', '', c.pid, 100.00, null, null]);
      logger.log(`  Seeded property:         ${c.address}`);
    } else {
      logger.log(`  Skipped property:        ${c.address} (exists)`);
    }

    // ── Assessment Document ────────────────────────────────────────────────────
    const [existingDoc] = await dataSource.query(
      `SELECT id FROM assessment_documents WHERE id = $1`, [c.assessmentDocumentId],
    );
    if (!existingDoc) {
      await dataSource.query(`
        INSERT INTO assessment_documents
            (id, client_id, file_path, document_name)
        VALUES ($1, $2, $3, $4)
      `, [
        c.assessmentDocumentId,
        c.clientId,
        `dispute-cases/${c.assessmentDocumentId}/valuation-notice.pdf`,
        'Land Tax Assessment Notice',
      ]);
      logger.log(`  Seeded assessment doc:   ${c.assessmentDocumentId}`);
    } else {
      logger.log(`  Skipped assessment doc:  ${c.assessmentDocumentId} (exists)`);
    }

    // ── Valuation Notice ───────────────────────────────────────────────────────
    const [existingNotice] = await dataSource.query(
      `SELECT id FROM valuation_notices WHERE id = $1`, [c.valuationNoticeId],
    );
    if (!existingNotice) {
      const delta = +(c.appraisedValue - c.assessedValue).toFixed(2);
      await dataSource.query(`
        INSERT INTO valuation_notices
            (id, property_id, source_document_id, appraised_by_id, valuation_date,
             assessed_land_value, appraised_value, valuation_delta, decision_outcome,
             is_exempt, notice_reference, analyst_notes, appraised_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        c.valuationNoticeId, c.propertyId, c.assessmentDocumentId, accountantId,
        '2024-07-01', c.assessedValue, c.appraisedValue, delta,
        'ADVISORY', false, `INTAKE-2025-${c.pid}`, '', '2026-04-09T00:00:00.000Z',
      ]);
      logger.log(`  Seeded valuation notice: ${c.valuationNoticeId}`);
    } else {
      logger.log(`  Skipped valuation notice:${c.valuationNoticeId} (exists)`);
    }

    // ── Dispute Case ───────────────────────────────────────────────────────────
    const [existingCase] = await dataSource.query(
      `SELECT id FROM dispute_cases WHERE id = $1`, [c.disputeCaseId],
    );
    if (!existingCase) {
      await dataSource.query(`
        INSERT INTO dispute_cases
            (id, case_reference, client_id, property_id, valuation_notice_id,
             assigned_accountant_id, assigned_lawyer_id, jurisdiction, status,
             statutory_deadline, no_legal_ground_flagged, original_assessed_value,
             reminder_count, client_approval_requested_at, last_reminder_sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        c.disputeCaseId, c.caseReference, c.clientId, c.propertyId,
        c.valuationNoticeId, accountantId, null, 'NSW',
        'awaiting_client_approval', '2026-12-31', false, c.assessedValue,
        c.reminder_count, c.client_approval_requested_at, c.last_reminder_sent_at,
      ]);
      logger.log(`  Seeded dispute case:     ${c.caseReference} [reminder_count=${c.reminder_count}]`);
    } else {
      logger.log(`  Skipped dispute case:    ${c.caseReference} (exists)`);
    }
  }
}

export async function seedNotifications(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const notificationRepo = dataSource.getRepository(Notification);

  const pol = await userRepo.findOneBy({ email: POL_EMAIL });
  if (!pol) {
    logger.warn(`User ${POL_EMAIL} not found — skipping notification seeder`);
    return;
  }
  logger.log(`Resolved: ${pol.fullName} (${pol.id})`);

  // ── Seed supporting dispute cases ──────────────────────────────────────────
  logger.log('\n── Dispute cases for notifications ──────────────────');
  await seedDisputeCasesForNotifications(dataSource, pol.id);

  // ── Seed notifications ─────────────────────────────────────────────────────
  logger.log('\n── Notifications ─────────────────────────────────────');
  for (const seed of NOTIFICATIONS) {
    const exists = await notificationRepo.findOneBy({ id: seed.id });
    if (exists) {
      logger.log(`  Skipped notification: ${seed.id} (exists)`);
      continue;
    }

    await notificationRepo.save(
      notificationRepo.create({
        id:      seed.id,
        userId:  pol.id,
        type:    seed.type,
        message: seed.message,
        caseId:  seed.caseId,
        read:    seed.read,
        readAt:  seed.readAt,
      }),
    );
    logger.log(`  Seeded notification: [${seed.type}] ${seed.message.slice(0, 70)}`);
  }
}
