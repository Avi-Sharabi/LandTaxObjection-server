import { Injectable, Logger } from '@nestjs/common';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { classifyComparablesForMedian } from 'src/common/utils/comparable-quarantine.util';
import { AssessmentDocumentsService } from '../assessment-documents/assessment-documents.service';
import { AssessmentDocument } from '../assessment-documents/entities/assessment-document.entity';
import { DisputeEvidenceIssue } from '../supporting-evidence/entities/dispute-evidence-issue.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { ValuationReportRepository } from './valuation-report.repository';
import { ValuationCtxCacheService } from './valuation-ctx-cache.service';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeObjectionReason } from './entities/dispute-objection-reason.entity';
import { hasScorableEvidence } from './evidence-rationale.util';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';

export const UNVERIFIED = 'AI_DETECTED_UNVERIFIED';

// document_type values PdfExtractorService.classifyAndExtractDocument assigns to a genuine
// client-supplied input document. Anything else — including its 'unknown' fallback — is either a
// pipeline artifact or a file whose content it could not recognise.
const INPUT_DOCUMENT_TYPES = new Set([
  'land_tax_notice',
  'benchmark_report',
  'sales_report',
  'land_value_search',
]);

// AssessmentDocumentsService.createArtifactRecord() / upsertArtifactRecord() write the pipeline's OWN
// outputs back into assessment_documents against the same dispute_case_id (ValuationReportService,
// EvidenceScoreReportService, SupportingEvidenceService, ObjectionReasonGeneratorService,
// PropertyContextService). The valuation report is the document the evidence score exists to qualify,
// so feeding it back in as evidence is circular — a confidently-worded report would inflate the score
// for the evidence beneath it.
//
// The Evidence Score Report is MORE circular still, because it prints the score itself: a stale copy
// read back in as client evidence would let a run see its own previous answer, the strongest possible
// anchoring on the one number the run exists to re-derive independently. Both its document_name and
// its blob filename are listed, since the two differ (see EvidenceScoreReportService) and either could
// reach shouldSendDocument() after a future refactor.
//
// Note this set is only load-bearing for artifacts whose document_name ends in ".pdf" — everything
// else is already excluded by isProbableInputUpload()'s extension test on the cold-cache path, by the
// INPUT_DOCUMENT_TYPES allowlist on the warm path, and by the %PDF- magic-byte check. That extension
// filter is an incidental side effect rather than a designed guard, so do not rely on it.
const GENERATED_DOCUMENT_NAMES = new Set([
  'valuation-report.pdf',
  'Evidence Score Report',
  'evidence-score-report.pdf',
]);

const PDF_MAGIC_BYTES = '%PDF-';

// Bounds on what goes over the wire. Without them a case with a long document history puts an
// unbounded number of megabytes into every call, including each press of a manual button. Anything
// these drop is logged rather than silently discarded.
const MAX_DOCUMENTS = 10;
const MAX_TOTAL_DOCUMENT_BYTES = 20 * 1024 * 1024;

// Primary/foreign keys, run bookkeeping and import provenance carry no evidentiary signal and would
// only spend tokens. Every other column is emitted verbatim, so a column added to the schema later
// reaches the model without this service needing to know about it.
const OMITTED_KEYS = new Set([
  'id',
  'dispute_case_id',
  'dispute_case',
  'created_by_id',
  'created_by',
  'run_id',
  'created_at',
  'source_file',
  'district_code',
  'property_id',
  'sale_counter',
  'download_datetime',
  'imported_at',
  'component_code',
]);

// The `numeric` columns. node-postgres hands these back as strings, so they must be re-emitted as
// JSON numbers — otherwise the snapshot mixes "850.00" with 850 across sibling fields and the model
// has to infer which are quantities. Deliberately a name list rather than a shape test, so
// identifier-like values (dealing_number, post codes) keep their exact printed form.
const NUMERIC_FIELDS = new Set([
  'area',
  'purchase_price',
  'adjusted_rate_per_sqm',
  'adjusted_land_value',
  'suggested_land_value',
  'interest_of_sale_percent',
]);

export interface ScorableDocument {
  documentName: string;
  documentType: string;
  base64: string;
  bytes: number;
}

export interface EligibleDocument {
  documentName: string;
  /** The cached content classification, or 'unclassified' when none was available. */
  documentType: string;
}

export interface LoadedDocuments {
  /**
   * The eligible documents with their bytes, for sending as native document blocks. Empty unless
   * `withDocumentBytes` was requested — `eligible` is the manifest either way.
   */
  documents: ScorableDocument[];
  /** Every document the assessment reads, whether or not its bytes were downloaded. */
  eligible: EligibleDocument[];
  skipped: { documentName: string; reason: string }[];
  // False when the cached classification was unavailable and the weaker name/extension filter had to
  // stand in — surfaced in the snapshot so the model knows the document set is less certain.
  classified: boolean;
}

export interface EvidenceSnapshotInputs {
  disputeCase: DisputeCase;
  comparables: ComparableSale[]; // every sale on file — unsampled
  issues: DisputeEvidenceIssue[];
  grounds: DisputeObjectionReason[];
  documents: LoadedDocuments;
}

export interface EvidenceSnapshotOptions {
  /**
   * Download and base64 the eligible PDFs so they can be sent as native document blocks.
   *
   * The scoring call needs them: they are the primary evidence it judges. The Evidence Score Report
   * deliberately does not — its job is to explain a judgement already made, and re-reading the source
   * documents would invite a second, possibly different view of the same evidence while re-uploading
   * up to 20 MB that receives no prompt caching.
   */
  withDocumentBytes: boolean;
}

export interface SnapshotMarkdownOptions {
  /** True when the caller is attaching `documents` as native document blocks on the same message. */
  documentsAttached: boolean;
}

const NO_DOCUMENTS: LoadedDocuments = {
  documents: [],
  eligible: [],
  skipped: [],
  classified: false,
};

/**
 * Loads and serialises the complete evidence record for a dispute case.
 *
 * One snapshot, two consumers: EvidenceScoreService judges it to produce the score, and
 * EvidenceScoreReportService explains that score from the very same material. Sharing it is not only
 * less code — it is the guarantee that the report never describes evidence the score was not derived
 * from, which is the one inconsistency a reader would notice immediately.
 *
 * Reads the three tabular groups through ValuationReportRepository rather than the feature services
 * because it is the only accessor that returns raw entities — the public response DTOs drop
 * verification_status (and, for grounds, concession_classification), which are the strongest
 * corroboration signals in the whole snapshot.
 *
 * Documents come from AssessmentDocumentsService because assessment_documents holds client uploads and
 * pipeline artifacts in one table with no column distinguishing them; the classification cached by the
 * analyze-ai run is what separates the two. See resolveDocuments().
 */
@Injectable()
export class EvidenceSnapshotService {
  private readonly logger = new Logger(EvidenceSnapshotService.name);

  constructor(
    private readonly repository: ValuationReportRepository,
    private readonly ctxCache: ValuationCtxCacheService, // cached document_type per document
    private readonly assessmentDocuments: AssessmentDocumentsService, // the rows + file_path
    private readonly azureBlob: AzureBlobService, // file_path -> PDF bytes
  ) {}

  async load(
    disputeCaseId: string,
    options: EvidenceSnapshotOptions,
  ): Promise<EvidenceSnapshotInputs> {
    const [disputeCase, comparables, issues, grounds] = await Promise.all([
      this.repository.findDisputeCaseWithRelations(disputeCaseId),
      // getAllComparables, not getComparables: the latter is the valuation report's 10-row sample.
      // Both consumers judge or narrate the whole set — the score recommends adding to it, and the
      // report repeats that advice — so a truncated read would say "add more sales" on a case that
      // already has plenty.
      this.repository.getAllComparables(disputeCaseId),
      this.repository.getLatestEvidenceIssues(disputeCaseId),
      // NOTE: MAX(run_id) can select a partially-inserted run if a manual recompute races an
      // in-flight objection-reason generation, which would score low. It self-heals on the next
      // pipeline run; the real fix is a transaction around persistGrounds.
      this.repository.getLatestObjectionReasons(disputeCaseId),
    ]);

    if (!disputeCase) throw new DisputeCaseNotFoundException(disputeCaseId);

    // Not inside the Promise.all: it needs disputeCase.valuation_notice to pick up the intake notice,
    // which is stored against the client rather than the case.
    const documents = await this.resolveDocuments(disputeCase, options);

    return { disputeCase, comparables, issues, grounds, documents };
  }

  /**
   * Whether a case has enough on file to be scored at all. Delegates to hasScorableEvidence() in
   * ./evidence-rationale.util, where the rule is documented.
   */
  hasScorableData({ comparables, issues, grounds }: EvidenceSnapshotInputs): boolean {
    return hasScorableEvidence({
      comparables: comparables.length,
      tickedIssues: issues.filter((i) => i.is_tick).length,
      tickedGrounds: grounds.filter((g) => g.is_tick).length,
    });
  }

  // ── Documents ───────────────────────────────────────────────────────────────

  /**
   * Resolves the client-uploaded source documents for the case, downloading them as base64 only when
   * the caller asked for bytes.
   *
   * Never throws: a blob or Redis failure must cost a caller its documents, not its whole result.
   * Every exclusion is recorded in `skipped` and rendered into the snapshot, so a document the model
   * never saw is visible to it as an omission rather than absent without trace.
   */
  private async resolveDocuments(
    disputeCase: DisputeCase,
    options: EvidenceSnapshotOptions,
  ): Promise<LoadedDocuments> {
    try {
      const docs = await this.assessmentDocuments.findForCase(
        disputeCase.id,
        disputeCase.valuation_notice?.source_document_id ?? null,
      );
      if (docs.length === 0) return NO_DOCUMENTS;

      // The analyze-ai run already classified every one of these documents by content
      // (PropertyContextService.fetchInputDocuments). That classification is the only thing that
      // reliably separates a client upload from a generated artifact, since assessment_documents has
      // no column for it. A cold cache falls back to the name filter in isProbableInputUpload.
      const ctx = await this.ctxCache.get(disputeCase.id);
      const typeByDocId = new Map((ctx?.caseDocuments ?? []).map((d) => [d.id, d.document_type]));
      const classified = typeByDocId.size > 0;

      const skipped: { documentName: string; reason: string }[] = [];
      const candidates: AssessmentDocument[] = [];

      for (const doc of docs) {
        const decision = this.shouldSendDocument(doc, typeByDocId, classified);
        if (decision.send) candidates.push(doc);
        else skipped.push({ documentName: doc.document_name, reason: decision.reason });
      }

      const eligible: EligibleDocument[] = candidates.map((doc) => ({
        documentName: doc.document_name,
        documentType: typeByDocId.get(doc.id) ?? 'unclassified',
      }));

      const documents = options.withDocumentBytes
        ? await this.downloadDocuments(candidates, skipped, typeByDocId)
        : [];

      this.logger.log(
        JSON.stringify({
          context: 'EvidenceSnapshot.documents_resolved',
          disputeCaseId: disputeCase.id,
          onFile: docs.length,
          eligible: eligible.length,
          sent: documents.length,
          withBytes: options.withDocumentBytes,
          skipped,
          classificationAvailable: classified,
        }),
      );

      return { documents, eligible, skipped, classified };
    } catch (err: unknown) {
      this.logger.warn(
        JSON.stringify({
          context: 'EvidenceSnapshot.documents_failed',
          disputeCaseId: disputeCase.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return NO_DOCUMENTS;
    }
  }

  private shouldSendDocument(
    doc: AssessmentDocument,
    typeByDocId: Map<string, string>,
    classified: boolean,
  ): { send: true } | { send: false; reason: string } {
    if (!doc.file_path) return { send: false, reason: 'no file stored' };
    if (GENERATED_DOCUMENT_NAMES.has(doc.document_name)) {
      return {
        send: false,
        reason: 'generated by this pipeline — excluded to avoid assessing our own output',
      };
    }

    if (classified) {
      const documentType = typeByDocId.get(doc.id);
      if (!documentType || !INPUT_DOCUMENT_TYPES.has(documentType)) {
        return {
          send: false,
          reason: `not a recognised client input document (classified '${documentType ?? 'unclassified'}')`,
        };
      }
      return { send: true };
    }

    return this.isProbableInputUpload(doc) ? { send: true } : { send: false, reason: 'not a PDF' };
  }

  // Fallback when no cached classification exists (cold Redis, or a manual recompute on a case whose
  // 7-day ctx has expired). Extension only: it cannot recognise a generated evidence PDF, so
  // resolveDocuments logs classificationAvailable:false and the snapshot says the set is unverified.
  private isProbableInputUpload(doc: AssessmentDocument): boolean {
    return doc.document_name.toLowerCase().endsWith('.pdf');
  }

  private async downloadDocuments(
    candidates: AssessmentDocument[],
    skipped: { documentName: string; reason: string }[],
    typeByDocId: Map<string, string>,
  ): Promise<ScorableDocument[]> {
    const documents: ScorableDocument[] = [];
    let totalBytes = 0;

    for (const doc of candidates) {
      if (documents.length >= MAX_DOCUMENTS) {
        skipped.push({
          documentName: doc.document_name,
          reason: `over the ${MAX_DOCUMENTS}-document cap for one call`,
        });
        continue;
      }

      let buffer: Buffer;
      try {
        buffer = await this.azureBlob.getFileContent(doc.file_path);
      } catch (err: unknown) {
        skipped.push({
          documentName: doc.document_name,
          reason: `could not be read from storage: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      // getFileContent returns an empty buffer for a null path rather than throwing.
      if (buffer.length === 0) {
        skipped.push({ documentName: doc.document_name, reason: 'stored file is empty' });
        continue;
      }

      // Checked on the bytes, not the filename: the screenshots createArtifactRecord() stores are
      // PNGs, and AnthropicService.call labels every document block application/pdf, so a mislabelled
      // image would reach the API as a corrupt PDF.
      if (!buffer.subarray(0, PDF_MAGIC_BYTES.length).toString('latin1').startsWith(PDF_MAGIC_BYTES)) {
        skipped.push({ documentName: doc.document_name, reason: 'not a PDF (no %PDF- header)' });
        continue;
      }

      if (totalBytes + buffer.length > MAX_TOTAL_DOCUMENT_BYTES) {
        skipped.push({
          documentName: doc.document_name,
          reason: 'over the total document size budget for one call',
        });
        continue;
      }

      totalBytes += buffer.length;
      documents.push({
        documentName: doc.document_name,
        documentType: typeByDocId.get(doc.id) ?? 'unclassified',
        base64: buffer.toString('base64'),
        bytes: buffer.length,
      });
    }

    return documents;
  }

  // ── Snapshot ────────────────────────────────────────────────────────────────

  /**
   * The complete evidence record as markdown, for either consumer's user message.
   *
   * Ends where the caller's own instructions begin: this method describes the data and nothing about
   * what to do with it, so the scorer's rubric instructions and the report's writing instructions stay
   * in their own services.
   */
  buildSnapshotMarkdown(
    inputs: EvidenceSnapshotInputs,
    options: SnapshotMarkdownOptions,
  ): string {
    const lines: string[] = [
      '# Dispute case evidence snapshot',
      '',
      'Every group below is the complete record for this case, serialised straight from the',
      'database — not a summary. Fields with no value are omitted rather than sent as null.',
    ];

    lines.push(...this.buildSubjectSection(inputs));
    lines.push(...this.buildComparablesSection(inputs));
    lines.push(...this.buildEvidenceIssuesSection(inputs));
    lines.push(...this.buildObjectionGroundsSection(inputs));
    lines.push(...this.buildDocumentsSection(inputs, options));

    return lines.join('\n');
  }

  /**
   * The subject the comparables are being compared TO. Without the locality the model cannot judge
   * whether a sale is local to the subject, and without the two land values it cannot size the
   * contended gap — both are rubric inputs, so omitting them silently disabled those rules and left
   * the model to mine the attached notice PDF for figures already sitting in our own tables.
   */
  private buildSubjectSection({ disputeCase }: EvidenceSnapshotInputs): string[] {
    const prop = disputeCase.property;
    const notice = disputeCase.valuation_notice;

    // notice.* carry a numericTransformer and arrive as numbers; the dispute_cases columns do not,
    // so node-postgres hands those back as strings.
    const assessedLandValue =
      notice?.assessed_land_value ?? this.toNumberOrNull(disputeCase.original_assessed_value);

    return [
      '',
      '## Subject property',
      'The property the objection concerns — the subject every comparable sale is being compared to.',
      '"assessed_land_value" is the VG figure under objection at the relevant valuation date;',
      '"prior_land_value" is the previous year\'s figure, so the two together show the uplift the',
      'client is reacting to. "contended_land_value" is THIS FIRM\'S OWN figure, computed as the',
      'median comparable land rate x site area — it is derived from the comparable sales below and is',
      'therefore NOT independent corroboration of them; do not count it twice. A contended value at or',
      'above the assessed value undercuts a value-too-high objection outright.',
      '"vg_recorded_area_sqm" is the area the VG has on record; "site_area_sqm" is the area we',
      'resolved from the Land Value Search or manual entry. A material difference between the two is',
      'itself evidence for an area or dimensions ground, independent of any sale.',
      'Any of these may be null, which means not recorded — never zero.',
      '```json',
      JSON.stringify(
        {
          case_reference: disputeCase.case_reference,
          address: prop?.address ?? null,
          locality: prop?.suburb ?? null,
          post_code: prop?.postcode ?? null,
          state: prop?.state ?? null,
          pid: prop?.pid ?? null,
          lot_dp: prop?.lot_dp ?? null,
          dimensions: prop?.dimensions ?? null,
          site_area_sqm: this.resolveSiteAreaSqm(prop),
          vg_recorded_area_sqm: notice?.land_area_vg_sqm ?? null,
          zoning: prop?.zoning ?? null,
          relevant_valuation_date: notice?.valuation_date
            ? new Date(notice.valuation_date).toISOString().split('T')[0]
            : null,
          assessed_land_value: assessedLandValue,
          prior_land_value: notice?.prior_land_value ?? null,
          contended_land_value: this.toNumberOrNull(disputeCase.internal_assessed_value),
        },
        null,
        2,
      ),
      '```',
    ];
  }

  toNumberOrNull(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // Mirrors ValuationReportService.resolveSiteAreaSqm: the Land Value Search extraction is the
  // preferred source; land_area_sqm remains the manual/legacy fallback.
  resolveSiteAreaSqm(prop: DisputeCase['property'] | undefined): number | null {
    if (!prop) return null;
    return (Number(prop.land_area_eplanning_sqm) || null) ?? (Number(prop.land_area_sqm) || null);
  }

  private buildComparablesSection({ comparables }: EvidenceSnapshotInputs): string[] {
    if (comparables.length === 0) {
      return ['', '## Comparable sales', 'No comparable sales on file for this case.'];
    }

    const lines = [
      '',
      '## Comparable sales',
      `${comparables.length} sale(s) on file — all listed below.`,
    ];
    lines.push(
      '"_median_status" is derived, not stored: EXCLUDED means the sale was left out of this firm\'s',
      'own headline $/m² median (part-interest sale, or a statistical outlier against the IQR fence',
      'across the full set) and provides no evidentiary support. Judge the INCLUDED set.',
      '"improvement_confidence" is exact for vacant land (no improvement deduction needed) and',
      'estimated where a flat 50% improvement deduction was assumed — estimated rates are softer',
      'evidence. "size_tier" of extrapolated marks a ranked-last-resort pick outside the standard',
      'and widened size bands, and "warning" carries the disclosed caveat for such a pick.',
      '',
      'CRITICAL — RATE BASIS. "adjusted_rate_per_sqm" is a LAND-ONLY rate: improvements have been',
      'stripped out (for improvement_confidence "estimated", by deducting a flat 50%) and the sale has',
      'been time-adjusted to the valuation date. It is NOT the sale rate. The raw sale rate is',
      'purchase_price / area, both supplied above, and it is roughly TWICE adjusted_rate_per_sqm on an',
      'improved sale.',
      'Rates printed in attached source documents (VG sales reports, benchmark component reports,',
      'agent material) are almost always GROSS SALE rates on that raw basis, not land-only rates.',
      'Before treating any figure from a document as agreeing or disagreeing with a figure here, put',
      'both on the same basis — compare a document rate against purchase_price / area, or strip',
      'improvements from the document rate before comparing it to adjusted_rate_per_sqm. A document',
      'rate that is about double a land-only rate is the SAME rate expressed differently, and is',
      'corroboration, not contradiction.',
    );

    // Same classifier the valuation report uses, so EXCLUDED means the same thing in both features —
    // but run here over every sale on file rather than the report's 10-row sample, so the IQR fence is
    // computed over the real population.
    const { quarantined } = classifyComparablesForMedian(comparables);
    const excluded = new Map(quarantined.map((q) => [q.item, q.reason]));

    const rows = comparables.map((c, i) => {
      const reason = excluded.get(c);
      return {
        ref: `C${i + 1}`,
        ...this.toJsonSafe(c),
        _median_status: reason ? `EXCLUDED — ${reason}` : 'INCLUDED',
      };
    });

    lines.push('```json', JSON.stringify(rows, null, 2), '```');

    return lines;
  }

  private buildEvidenceIssuesSection({ issues }: EvidenceSnapshotInputs): string[] {
    const ticked = issues.filter((i) => i.is_tick);

    if (ticked.length === 0) {
      return [
        '',
        '## Supporting evidence issues',
        `No issues ticked for this case (${issues.length} detected in the latest run).`,
      ];
    }

    const lines = ['', '## Supporting evidence issues'];
    lines.push(
      `${ticked.length} of ${issues.length} detected issues are ticked; all ticked issues follow in full.`,
    );
    lines.push(
      '"documents_to_attach" lists documents STILL TO BE OBTAINED for the issue — it is an evidence',
      'gap, not evidence held. A missing "verification_status" means ' + UNVERIFIED + '.',
      '"text_box_content" is the analyst/AI narrative for the issue, verbatim and untruncated.',
    );

    lines.push('```json', JSON.stringify(ticked.map((i) => this.toJsonSafe(i)), null, 2), '```');

    return lines;
  }

  private buildObjectionGroundsSection({ grounds }: EvidenceSnapshotInputs): string[] {
    const ticked = grounds.filter((g) => g.is_tick);

    if (ticked.length === 0) {
      return [
        '',
        '## Objection grounds',
        `No grounds ticked for this case (${grounds.length} assessed in the latest run).`,
      ];
    }

    const lines = ['', '## Objection grounds'];
    lines.push(
      `${ticked.length} of ${grounds.length} assessed grounds are ticked; all ticked grounds follow in full.`,
    );
    lines.push(
      '"analysis" is the finding written by an earlier automated step from the client\'s documents,',
      'verbatim and untruncated — a ground with no analysis asserts nothing. A missing',
      '"verification_status" means ' + UNVERIFIED + '. "evidence_files" names files attached to the',
      'ground; their contents are not included here. "concession_classification" of',
      'NO_MATCHING_PORTAL_TYPE means the finding has no corresponding VG portal option and may not',
      'be lodgeable as currently framed.',
    );

    lines.push('```json', JSON.stringify(ticked.map((g) => this.toJsonSafe(g)), null, 2), '```');

    return lines;
  }

  private buildDocumentsSection(
    { documents }: EvidenceSnapshotInputs,
    { documentsAttached }: SnapshotMarkdownOptions,
  ): string[] {
    const { documents: sent, eligible, skipped, classified } = documents;

    if (eligible.length === 0) {
      const lines = [
        '',
        '## Source documents',
        'No client-uploaded source documents were resolved for this case.',
      ];
      if (skipped.length > 0) {
        lines.push('The following documents are on file but were not used:');
        lines.push('```json', JSON.stringify(skipped, null, 2), '```');
      }
      return lines;
    }

    const lines = ['', '## Source documents'];

    if (documentsAttached) {
      lines.push(
        `${sent.length} client-uploaded PDF(s) are attached to this message as document blocks, listed`,
        'below in the same order. Read them as primary evidence: they are the source material the',
        'structured groups above were extracted from, and they are the strongest corroboration',
        'available for any claim made there. A claim the documents contradict is a defect in the core',
        'case, not a gap.',
      );
      lines.push(
        '```json',
        JSON.stringify(sent.map(({ documentName, documentType, bytes }) => ({ documentName, documentType, bytes })), null, 2),
        '```',
      );
    } else {
      lines.push(
        `${eligible.length} client-uploaded source document(s) were read by the evidence assessment.`,
        'Their contents are NOT included here — only the manifest. Treat each as a document the',
        'assessment has read: never describe one as missing, and never describe one as unread.',
      );
      lines.push('```json', JSON.stringify(eligible, null, 2), '```');
    }

    if (!classified) {
      lines.push(
        'NOTE: content classification was unavailable for this case, so these were selected by file',
        'type alone — one may be a system-generated file rather than a client upload. Weigh',
        'accordingly, and do not treat a document that reads as our own output as independent',
        'corroboration.',
      );
    }

    if (skipped.length > 0) {
      lines.push(
        'Also on file but NOT used — treat as evidence that has not been read, not as absent evidence:',
      );
      lines.push('```json', JSON.stringify(skipped, null, 2), '```');
    }

    return lines;
  }

  /**
   * Serialises an entity for the snapshot: drops keys with no evidentiary signal, drops empty values,
   * re-types numeric-as-string columns and shortens timestamps to dates. Everything else passes
   * through untouched, so the snapshot stays complete as the schema grows.
   */
  private toJsonSafe(entity: object): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(entity)) {
      if (OMITTED_KEYS.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;

      if (value instanceof Date) {
        out[key] = value.toISOString().split('T')[0];
      } else if (NUMERIC_FIELDS.has(key)) {
        const n = Number(value);
        out[key] = Number.isFinite(n) ? n : value;
      } else {
        out[key] = value;
      }
    }

    return out;
  }
}
