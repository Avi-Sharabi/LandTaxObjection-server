import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User, UserRole } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';
import { AssessmentDocument } from 'src/api/assessment-documents/entities/assessment-document.entity';
import { Property } from 'src/api/properties/entities/property.entity';
import { ValuationNotice, DecisionOutcome } from 'src/api/valuation-notices/entities/valuation-notice.entity';
import { OwnershipType } from 'src/common/enums/ownership-type.enum';
import { DisputeCase, DisputeStatus, Jurisdiction } from 'src/api/dispute-cases/entities/dispute-case.entity';
import { DisputeLegalGround, LegalGround } from 'src/api/dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { DisputeConstraint, ConstraintType } from 'src/api/dispute-constraints/entities/dispute-constraint.entity';
import { ConstraintFile } from 'src/api/constraint-files/entities/constraint-file.entity';
import { UploadStatus, UploadedByRole } from 'src/api/valuation-notices/entities/upload-status.enum';
import { ComparableSale } from 'src/api/comparables/entities/comparable-sale.entity';
import { DisputeEvidenceIssue } from 'src/api/supporting-evidence/entities/dispute-evidence-issue.entity';
import { DisputeObjectionReason } from 'src/api/dispute-cases/entities/dispute-objection-reason.entity';
import { Notification, NotificationType } from 'src/api/notifications/entities/notification.entity';
import { AiUpdateLog } from 'src/api/ai-update-log/entities/ai-update-log.entity';
import { AuditLog, AuditAction } from 'src/api/audit-log/entities/audit-log.entity';

const logger = new Logger('UpdateDatabaseTestSeeder');

// ─── Deterministic ids (never referenced by the test suite — it addresses every
// row by a stable, human-readable business field instead; these only exist so
// this seeder can find-or-create the same rows on every re-run) ───────────────
const IDS = {
  user:                   'b1000000-0000-0000-0000-000000000001',
  client:                 'b1000000-0000-0000-0000-000000000002',
  assessmentDocument:     'b1000000-0000-0000-0000-000000000003',
  property:               'b1000000-0000-0000-0000-000000000004',
  valuationNotice:        'b1000000-0000-0000-0000-000000000005',
  disputeCase:            'b1000000-0000-0000-0000-000000000006',
  disputeLegalGround:     'b1000000-0000-0000-0000-000000000007',
  disputeConstraint:      'b1000000-0000-0000-0000-000000000008',
  constraintFile:         'b1000000-0000-0000-0000-000000000009',
  comparableSale:         'b1000000-0000-0000-0000-00000000000a',
  disputeEvidenceIssue:   'b1000000-0000-0000-0000-00000000000b',
  disputeObjectionReason: 'b1000000-0000-0000-0000-00000000000c',
  notification:           'b1000000-0000-0000-0000-00000000000d',
  aiUpdateLog:            'b1000000-0000-0000-0000-00000000000e',
  auditLog:               'b1000000-0000-0000-0000-00000000000f',
};

// Fixed epoch-ms literal — not a real analyze-ai run, just a stable value the
// two run-scoped tables (dispute_evidence_issues/dispute_objection_reasons)
// require for their NOT NULL run_id column.
const QA_FIXTURE_RUN_ID = 1_700_000_000_000;

// ─── Stable, human-readable business fields the test suite references directly
// (see tests/update-database.test.js for the exact chat instructions) ─────────
export const QA_FIXTURE = {
  userEmail:        'qa-updatedb-fixture@example.com',
  clientName:       'QA UpdateDB Fixture Client',
  propertyPid:      'QA-FIXTURE-0001',
  noticeReference:  'QA-UPDATEDB-FIXTURE-NOTICE',
  caseReference:    'QA-UPDATE-DB-FIXTURE',
  comparableSaleId: 'QA-FIXTURE-COMP-001',
  aiUpdateLogAction: 'QA-UPDATEDB-FIXTURE-SEED-MARKER',
};

export async function seedUpdateDatabaseTestFixture(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const clientRepo = dataSource.getRepository(Client);
  const assessmentDocumentRepo = dataSource.getRepository(AssessmentDocument);
  const propertyRepo = dataSource.getRepository(Property);
  const valuationNoticeRepo = dataSource.getRepository(ValuationNotice);
  const disputeCaseRepo = dataSource.getRepository(DisputeCase);
  const disputeLegalGroundRepo = dataSource.getRepository(DisputeLegalGround);
  const disputeConstraintRepo = dataSource.getRepository(DisputeConstraint);
  const constraintFileRepo = dataSource.getRepository(ConstraintFile);
  const comparableSaleRepo = dataSource.getRepository(ComparableSale);
  const disputeEvidenceIssueRepo = dataSource.getRepository(DisputeEvidenceIssue);
  const disputeObjectionReasonRepo = dataSource.getRepository(DisputeObjectionReason);
  const notificationRepo = dataSource.getRepository(Notification);
  const aiUpdateLogRepo = dataSource.getRepository(AiUpdateLog);
  const auditLogRepo = dataSource.getRepository(AuditLog);

  // ── User ─────────────────────────────────────────────────────────────────
  // Dedicated fixture account — never the real login account this suite
  // authenticates with. A past incident (a "delete the user" test targeting the
  // live login account) caused a self-lockout; this row exists specifically so
  // role/is_active/full_name/phone can all be exercised without that risk.
  let user = await userRepo.findOneBy({ id: IDS.user });
  if (!user) {
    user = await userRepo.save(
      userRepo.create({
        id: IDS.user,
        email: QA_FIXTURE.userEmail,
        fullName: 'QA UpdateDB Fixture User',
        role: UserRole.ACCOUNTANT,
        phone: '+61 2 0000 0000',
        isActive: true,
      }),
    );
    logger.log(`Seeded user: ${QA_FIXTURE.userEmail}`);
  } else {
    logger.log(`Skipped user (already exists): ${QA_FIXTURE.userEmail}`);
  }

  // ── Client ───────────────────────────────────────────────────────────────
  let client = await clientRepo.findOne({ where: { id: IDS.client }, withDeleted: true });
  if (!client) {
    client = await clientRepo.save(
      clientRepo.create({
        id: IDS.client,
        name: QA_FIXTURE.clientName,
        email: 'qa-updatedb-fixture-client@example.com',
        status: ClientStatus.ACTIVE,
        assigned_accountant_id: user.id,
        fax: null,
      }),
    );
    logger.log(`Seeded client: ${QA_FIXTURE.clientName}`);
  } else {
    logger.log(`Skipped client (already exists): ${QA_FIXTURE.clientName}`);
  }
  if (client.deleted_at) {
    await clientRepo.restore(IDS.client);
    logger.log(`Restored soft-deleted client: ${QA_FIXTURE.clientName}`);
  }

  // ── Assessment Document ──────────────────────────────────────────────────
  // Created before the valuation notice so its id is available for
  // valuation_notices.source_document_id.
  let assessmentDocument = await assessmentDocumentRepo.findOneBy({ id: IDS.assessmentDocument });
  if (!assessmentDocument) {
    assessmentDocument = await assessmentDocumentRepo.save(
      assessmentDocumentRepo.create({
        id: IDS.assessmentDocument,
        client_id: client.id,
        document_name: 'QA UpdateDB Fixture Assessment Document',
        file_path: null,
      }),
    );
    logger.log('Seeded assessment document: QA UpdateDB Fixture Assessment Document');
  } else {
    logger.log('Skipped assessment document (already exists)');
  }

  // ── Property ─────────────────────────────────────────────────────────────
  let property = await propertyRepo.findOneBy({ id: IDS.property });
  if (!property) {
    property = await propertyRepo.save(
      propertyRepo.create({
        id: IDS.property,
        client_id: client.id,
        address: '1 QA Fixture Court',
        suburb: 'QA Fixture Springs',
        state: Jurisdiction.NSW,
        pid: QA_FIXTURE.propertyPid,
        postcode: '2999',
        ownership_pct: 100.0,
        land_area_sqm: 500,
        zoning: 'QA Fixture Zone',
        lot_dp: 'Lot 1 / DP 999999',
        dimensions: null,
        height_limit_m: null,
      }),
    );
    logger.log(`Seeded property: ${QA_FIXTURE.propertyPid}`);
  } else {
    logger.log(`Skipped property (already exists): ${QA_FIXTURE.propertyPid}`);
  }

  // ── Valuation Notice ─────────────────────────────────────────────────────
  let valuationNotice = await valuationNoticeRepo.findOneBy({ id: IDS.valuationNotice });
  if (!valuationNotice) {
    valuationNotice = await valuationNoticeRepo.save(
      valuationNoticeRepo.create({
        id: IDS.valuationNotice,
        property_id: property.id,
        valuation_date: new Date('2026-01-01'),
        assessed_land_value: 1_000_000,
        prior_land_value: 900_000,
        ownership_type: OwnershipType.INDIVIDUAL,
        is_foreign: false,
        is_exempt: false,
        notice_reference: QA_FIXTURE.noticeReference,
        source_document_id: assessmentDocument.id,
        decision_outcome: DecisionOutcome.OBJECTION,
        appraised_by_id: user.id,
      }),
    );
    logger.log(`Seeded valuation notice: ${QA_FIXTURE.noticeReference}`);
  } else {
    logger.log(`Skipped valuation notice (already exists): ${QA_FIXTURE.noticeReference}`);
  }

  // ── Dispute Case ─────────────────────────────────────────────────────────
  let disputeCase = await disputeCaseRepo.findOne({ where: { id: IDS.disputeCase }, withDeleted: true });
  if (!disputeCase) {
    disputeCase = await disputeCaseRepo.save(
      disputeCaseRepo.create({
        id: IDS.disputeCase,
        case_reference: QA_FIXTURE.caseReference,
        client_id: client.id,
        property_id: property.id,
        valuation_notice_id: valuationNotice.id,
        assigned_accountant_id: user.id,
        jurisdiction: Jurisdiction.NSW,
        status: DisputeStatus.DRAFT,
        statutory_deadline: new Date('2026-12-31'),
        notes: null,
      }),
    );
    logger.log(`Seeded dispute case: ${QA_FIXTURE.caseReference}`);
  } else {
    logger.log(`Skipped dispute case (already exists): ${QA_FIXTURE.caseReference}`);
  }
  // Self-heal: this row is permanent and reused across every test run (unlike
  // the disposable rows other seeders create) — force structural fields back
  // to baseline if a previous, incompletely-reverted test run left them
  // drifted. Scratch fields (notes, fax, etc.) are intentionally NOT healed
  // here — each test already reverts its own scratch field in its own
  // finally/afterAll.
  if (disputeCase.deleted_at) {
    await disputeCaseRepo.restore(IDS.disputeCase);
    logger.log(`Restored soft-deleted dispute case: ${QA_FIXTURE.caseReference}`);
  }
  if (disputeCase.status !== DisputeStatus.DRAFT || disputeCase.assigned_accountant_id !== user.id) {
    await disputeCaseRepo.update(IDS.disputeCase, {
      status: DisputeStatus.DRAFT,
      assigned_accountant_id: user.id,
    });
    logger.log(`Healed drifted dispute case fields: ${QA_FIXTURE.caseReference}`);
  }

  // ── Dispute Legal Ground ─────────────────────────────────────────────────
  let disputeLegalGround = await disputeLegalGroundRepo.findOneBy({ id: IDS.disputeLegalGround });
  if (!disputeLegalGround) {
    disputeLegalGround = await disputeLegalGroundRepo.save(
      disputeLegalGroundRepo.create({
        id: IDS.disputeLegalGround,
        dispute_id: disputeCase.id,
        ground: LegalGround.INCORRECT_LAND_VALUE,
        validated: false,
      }),
    );
    logger.log('Seeded dispute legal ground: incorrect_land_value');
  } else {
    logger.log('Skipped dispute legal ground (already exists)');
  }

  // ── Dispute Constraint ───────────────────────────────────────────────────
  let disputeConstraint = await disputeConstraintRepo.findOneBy({ id: IDS.disputeConstraint });
  if (!disputeConstraint) {
    disputeConstraint = await disputeConstraintRepo.save(
      disputeConstraintRepo.create({
        id: IDS.disputeConstraint,
        dispute_id: disputeCase.id,
        constraint_type: ConstraintType.HERITAGE_LISTING,
        description: null,
      }),
    );
    logger.log('Seeded dispute constraint: heritage_listing');
  } else {
    logger.log('Skipped dispute constraint (already exists)');
  }

  // ── Constraint File ──────────────────────────────────────────────────────
  let constraintFile = await constraintFileRepo.findOneBy({ id: IDS.constraintFile });
  if (!constraintFile) {
    constraintFile = await constraintFileRepo.save(
      constraintFileRepo.create({
        id: IDS.constraintFile,
        dispute_constraint_id: disputeConstraint.id,
        document_category: ConstraintType.HERITAGE_LISTING,
        blob_path: `clients/${client.id}/dispute-constraints/${disputeConstraint.id}/qa-updatedb-fixture-heritage-listing.pdf`,
        original_name: 'QA UpdateDB Fixture Heritage Listing Evidence.pdf',
        file_size_bytes: 102_400,
        upload_status: UploadStatus.COMPLETE,
        uploaded_by: user.id,
        uploaded_by_role: UploadedByRole.STAFF,
        confirmed_by: null,
        confirmed_at: null,
      }),
    );
    logger.log('Seeded constraint file: QA UpdateDB Fixture Heritage Listing Evidence.pdf');
  } else {
    logger.log('Skipped constraint file (already exists)');
  }

  // ── Comparable Sale ──────────────────────────────────────────────────────
  let comparableSale = await comparableSaleRepo.findOneBy({ id: IDS.comparableSale });
  if (!comparableSale) {
    comparableSale = await comparableSaleRepo.save(
      comparableSaleRepo.create({
        id: IDS.comparableSale,
        dispute_case_id: disputeCase.id,
        created_by_id: user.id,
        sale_id: QA_FIXTURE.comparableSaleId,
        explanation: null,
      }),
    );
    logger.log(`Seeded comparable sale: ${QA_FIXTURE.comparableSaleId}`);
  } else {
    logger.log(`Skipped comparable sale (already exists): ${QA_FIXTURE.comparableSaleId}`);
  }

  // ── Dispute Evidence Issue ───────────────────────────────────────────────
  let disputeEvidenceIssue = await disputeEvidenceIssueRepo.findOneBy({ id: IDS.disputeEvidenceIssue });
  if (!disputeEvidenceIssue) {
    disputeEvidenceIssue = await disputeEvidenceIssueRepo.save(
      disputeEvidenceIssueRepo.create({
        id: IDS.disputeEvidenceIssue,
        dispute_case_id: disputeCase.id,
        issue_type: 'access_constraints',
        is_tick: false,
        confidence: null,
        trigger: null,
        text_box_content: null,
        documents_to_attach: null,
        run_id: QA_FIXTURE_RUN_ID,
      }),
    );
    logger.log('Seeded dispute evidence issue: access_constraints');
  } else {
    logger.log('Skipped dispute evidence issue (already exists)');
  }

  // ── Dispute Objection Reason ─────────────────────────────────────────────
  let disputeObjectionReason = await disputeObjectionReasonRepo.findOneBy({ id: IDS.disputeObjectionReason });
  if (!disputeObjectionReason) {
    disputeObjectionReason = await disputeObjectionReasonRepo.save(
      disputeObjectionReasonRepo.create({
        id: IDS.disputeObjectionReason,
        dispute_case_id: disputeCase.id,
        ground_number: 1,
        label: 'Incorrect Land Value',
        is_tick: false,
        concession_type: null,
        concession_type_note: null,
        analysis: null,
        evidence_files: null,
        run_id: QA_FIXTURE_RUN_ID,
      }),
    );
    logger.log('Seeded dispute objection reason: ground 1 — Incorrect Land Value');
  } else {
    logger.log('Skipped dispute objection reason (already exists)');
  }

  // ── Notification ─────────────────────────────────────────────────────────
  let notification = await notificationRepo.findOneBy({ id: IDS.notification });
  if (!notification) {
    notification = await notificationRepo.save(
      notificationRepo.create({
        id: IDS.notification,
        userId: user.id,
        type: NotificationType.APPROVAL_REQUESTED,
        message: 'QA UpdateDB fixture — seeded notification for Update-via-chat testing.',
        caseId: disputeCase.id,
        read: false,
        readAt: null,
      }),
    );
    logger.log('Seeded notification for QA UpdateDB fixture user');
  } else {
    logger.log('Skipped notification (already exists)');
  }

  // ── AI Update Log ────────────────────────────────────────────────────────
  // No FK constraints on this table at all — action is seeded with a marker
  // string that can never collide with a real row (real rows always store
  // JSON.stringify({table, previous_values, new_values})).
  let aiUpdateLog = await aiUpdateLogRepo.findOneBy({ id: IDS.aiUpdateLog });
  if (!aiUpdateLog) {
    aiUpdateLog = await aiUpdateLogRepo.save(
      aiUpdateLogRepo.create({
        id: IDS.aiUpdateLog,
        action: QA_FIXTURE.aiUpdateLogAction,
        recordId: disputeCase.id,
        performedBy: 'qa-updatedb-fixture-seed',
      }),
    );
    logger.log('Seeded ai_update_logs fixture row');
  } else {
    logger.log('Skipped ai_update_logs fixture row (already exists)');
  }

  // ── Audit Log ────────────────────────────────────────────────────────────
  let auditLog = await auditLogRepo.findOneBy({ id: IDS.auditLog });
  if (!auditLog) {
    auditLog = await auditLogRepo.save(
      auditLogRepo.create({
        id: IDS.auditLog,
        action: AuditAction.SUBMITTED_TO_VG,
        performedBy: user.id,
        caseId: disputeCase.id,
        lodgmentReferenceNumber: null,
      }),
    );
    logger.log('Seeded audit_logs fixture row');
  } else {
    logger.log('Skipped audit_logs fixture row (already exists)');
  }

  logger.log(`\n  → QA UpdateDB fixture chain ready. Anchor: dispute case '${QA_FIXTURE.caseReference}'.`);
}
