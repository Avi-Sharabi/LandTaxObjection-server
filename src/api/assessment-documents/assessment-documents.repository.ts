import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AssessmentDocument,
  AssessmentDocumentType,
  REPORTS_UPLOADED_REQUIRED_TYPES,
} from './entities/assessment-document.entity';

/**
 * What "this required report is on file" means, in one place.
 *
 * Correlates on an OUTER `required.document_type` and a caller-supplied `dispute_case_id`, so both
 * the promotion guard (which asks "is any required type still missing?") and the blocker lookup
 * (which asks "which ones?") build on the same definition. A second spelling would let the gate
 * and the explanation of the gate disagree — and only one of them is visible to a user.
 */
const REQUIRED_REPORT_ON_FILE = `
  SELECT 1 FROM assessment_documents ad
   WHERE ad.dispute_case_id = %CASE_ID%
     AND ad.document_type = required.document_type
     AND ad.file_path IS NOT NULL`;

@Injectable()
export class AssessmentDocumentsRepository {
  constructor(
    @InjectRepository(AssessmentDocument)
    private readonly assessmentDocumentRepo: Repository<AssessmentDocument>,
  ) {}

  /**
   * Column-limited lookup for the download path — only file_path (to locate the
   * blob) and document_name (to build the filename) are needed, so the rest of
   * the row is not fetched.
   */
  async findByIdForDownload(id: string): Promise<AssessmentDocument | null> {
    return this.assessmentDocumentRepo.findOne({
      where: { id },
      select: { id: true, file_path: true, document_name: true },
    });
  }

  /**
   * Advances a case to `reports_uploaded` once both required report types (a land value search
   * and a sales report — see REPORTS_UPLOADED_REQUIRED_TYPES) are on file.
   *
   * Lives here rather than in the dispute-cases transition service on purpose: dispute-cases
   * already imports AssessmentDocumentsModule, so injecting the other way round would be a
   * circular module dependency. This module already has the DisputeCase repository registered.
   *
   * Written as ONE guarded UPDATE so it is inherently idempotent and cannot move a case backwards:
   *  - `status = 'tnc_agreed'` is the only legal predecessor, so a case already analysed or lodged
   *    is untouched, and a case whose T&C is not yet agreed is left alone rather than skipping a
   *    step.
   *  - `file_path IS NOT NULL` means a metadata-only row (created when no file was supplied)
   *    cannot satisfy "uploaded".
   *
   * Returns whether the case moved. Zero rows affected is a normal outcome, not an error.
   */
  async promoteToReportsUploadedIfComplete(
    disputeCaseId: string,
  ): Promise<boolean> {
    const result: unknown = await this.assessmentDocumentRepo.manager.query(
      `UPDATE dispute_cases dc
          SET status = 'reports_uploaded'
        WHERE dc.id = $1
          AND dc.deleted_at IS NULL
          AND dc.status = 'tnc_agreed'
          AND NOT EXISTS (
            SELECT 1 FROM unnest($2::text[]) AS required(document_type)
             WHERE NOT EXISTS (${REQUIRED_REPORT_ON_FILE.replace('%CASE_ID%', 'dc.id')})
          )`,
      [disputeCaseId, [...REPORTS_UPLOADED_REQUIRED_TYPES]],
    );
    const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
    return affected > 0;
  }

  /**
   * Which required report types have no uploaded file on the case, in
   * REPORTS_UPLOADED_REQUIRED_TYPES order — i.e. exactly why
   * promoteToReportsUploadedIfComplete above did not fire.
   *
   * Lives beside that guard, and shares its predicate, so the reason a user is shown can never
   * describe a different rule from the one actually blocking them. Read by
   * DisputeStatusTransitionService.findSystemBlockers.
   */
  async findMissingRequiredReportTypes(
    disputeCaseId: string,
  ): Promise<AssessmentDocumentType[]> {
    const rows: unknown = await this.assessmentDocumentRepo.manager.query(
      `SELECT required.document_type AS type
         FROM unnest($2::text[]) AS required(document_type)
        WHERE NOT EXISTS (${REQUIRED_REPORT_ON_FILE.replace('%CASE_ID%', '$1')})`,
      [disputeCaseId, [...REPORTS_UPLOADED_REQUIRED_TYPES]],
    );
    const missing = Array.isArray(rows)
      ? rows.map((row) => (row as { type: AssessmentDocumentType }).type)
      : [];
    // unnest does not guarantee ordering; sort back into the declared order so the message a user
    // reads is stable between calls.
    return REPORTS_UPLOADED_REQUIRED_TYPES.filter((type) =>
      missing.includes(type),
    );
  }
}
