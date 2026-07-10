export interface EplanningApiData {
  layers: EplanningLayer[];
  sepp: EplanningSeppEntry[];
  warn: EplanningWarnEntry[];
  council: string[];
}

export interface EplanningLayer {
  layerName: string;
  results: Record<string, unknown>[];
}

export interface EplanningSeppEntry {
  seppName: string;
  mapName?: string[];
  seppLink?: string;
}

export interface EplanningWarnEntry {
  title?: string;
  layerRef?: string;
}

export interface ReportMeta {
  lot: string | null;
  plan: string | null;
  planType: string;
  assessed_land_value: number | null;
  revenue_nsw_notice_date: string | null;
  fsr_from_pdf: number | null;
  land_area_sqm: number | null;
  height_limit_m: number | null;
  concession_mentions: string[];
  heritage_mentions: string[];
  multiple_lots_in_report: string[];
}

export interface SupportingEvidenceContext {
  propId: string;
  confirmedAddress: string;
  reportText: string;
  reportBuffer: Buffer | null;
  apiData: EplanningApiData;
  lat: number;
  lng: number;
  lotAreaM2: number | null;
  meta: ReportMeta;
  spatialBase64: string | null;
  contextBase64: string | null;
  closeupBase64: string | null;
  inputComparables: InputComparable[];
  inputBenchmarkReport: BenchmarkReport | null;
  landTaxNotice: LandTaxNotice | null;
  inputDocumentsText: string[];
  entityEvidence: EntityEvidence | null;
  evidenceResult: SupportingEvidenceResult | null;
  caseDocuments: CaseDocumentSummary[];
}

// Existence record for every assessment_document tied to this case, independent of whether
// classifyAndExtractDocument recognised its content — a document that fails classification
// still needs to show as "on file" for the report's Evidence Checklist (document_type: 'unknown').
// created_at is a string, not Date: ValuationCtxCacheService round-trips ctx through JSON when
// Redis is configured, and a Date would silently degrade to a string with no revival on read —
// same convention already used for LandTaxNotice.issue_date/payment_due_date.
export interface CaseDocumentSummary {
  id: string;
  document_name: string;
  created_at: string;
  document_type: string;
}

export interface EvidenceRawData {
  flood_data: Record<string, unknown> | null;
  contaminated_land: Record<string, unknown> | null;
  ols_data: Record<string, unknown>[] | null;
  pdf_encumbrances: string[] | null;
  heritage_arcgis_items: Record<string, unknown>[] | null;
  heritage_layers: EplanningLayer[] | null;
  vg_comparables: Record<string, unknown>[] | null;
  adjacent_lots: Record<string, unknown>[];
}

export interface InputComparable {
  address: string;
  area_m2: number;
  zone?: string;
  // AI-extracted from an uploaded PDF/sales report — the model can return null when a comparable's
  // value can't be determined from the source document, despite this notionally being "always" a number.
  analysed_land_value: number | null;
  rate_per_m2?: number;
  contract_date?: string;
}

export interface BenchmarkReport {
  component?: string;
  base_date?: string;
  component_factor?: number;
  benchmarks?: unknown[];
  sales?: InputComparable[];
}

export interface LandTaxNotice {
  owner?: string;
  issue_date?: string;
  properties?: Array<{
    address: string;
    property_id?: string;
    // AI-extracted from the land tax notice PDF — individual years can be null when not legible/present.
    land_values?: Record<string, number | null>;
  }>;
  total_aggregated_value?: number;
  // AI-extracted financial figures — not independently verified. Treat as "confirm before relying on it",
  // not fact, since an error here (esp. payment_due_date) has real financial consequences (interest accrues).
  land_tax_payable?: number | null;
  arrears?: number | null;
  interest?: number | null;
  total_amount_payable?: number | null;
  payment_due_date?: string | null;
}

// Distinct from `confidence` (the model's self-assessed likelihood the underlying fact is true,
// based on desktop data — ArcGIS layers, satellite imagery, ePlanning PDFs). verification_status
// answers whether the finding has actually been corroborated with obtained evidence — today no
// supporting-evidence issue has a document-obtaining step, so this is always AI_DETECTED_UNVERIFIED
// until such a step exists. The report generator must not render "CONFIRMED" language from
// confidence alone; it must check this field.
export type VerificationStatus = 'AI_DETECTED_UNVERIFIED' | 'EVIDENCE_OBTAINED' | 'CLIENT_CONFIRMED';

export interface IssueResult {
  tick: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL_REVIEW_REQUIRED';
  verification_status: VerificationStatus;
  trigger: string | null;
  text_box_content: string | null;
  documents_to_attach: string[];
  [key: string]: unknown;
}

export interface GroupingIssueResult {
  valued_together: {
    tick: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL_REVIEW_REQUIRED';
    verification_status?: VerificationStatus;
    trigger?: string | null;
    text_box_content?: string | null;
    documents_to_attach?: string[];
  };
  valued_separately: {
    tick: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL_REVIEW_REQUIRED';
    verification_status?: VerificationStatus;
    trigger?: string | null;
    text_box_content?: string | null;
    documents_to_attach?: string[];
  };
  [key: string]: unknown;
}

export interface SupportingEvidenceResult {
  property_address: string;
  property_id: string;
  lot_plan: string;
  assessed_land_value: number | null;
  run_date: string;
  run_id: number;
  issues: {
    access_constraints: IssueResult | null;
    planning: IssueResult | null;
    environmental: IssueResult | null;
    easements: IssueResult | null;
    heritage: IssueResult | null;
    apportionment: IssueResult | null;
    grouping: GroupingIssueResult | null;
    concession: IssueResult | null;
    other: IssueResult | null;
    inspection_access: IssueResult | null;
    inspection_easement: IssueResult | null;
    inspection_environmental: IssueResult | null;
    inspection_views: IssueResult | null;
  };
}

export interface EntityEvidence {
  groundDocIds: Record<string, string[]>;
  // Human-readable label per docId (source display name), index-paired with groundDocIds —
  // used to describe evidence to the report-writing LLM without exposing raw document UUIDs.
  // Optional: seeded/test fixtures may omit it since they don't populate real documents.
  groundLabels?: Record<string, string[]>;
  groundAnalysis: Record<string, string>;
  clientName: string;
}

export interface CadastreFeature {
  lot: string | null;
  plan: string | null;
  planType: string;
  areaM2: number | null;
  cadId: string | null;
}
