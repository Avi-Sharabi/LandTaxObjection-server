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
  analysed_land_value: number;
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
    land_values?: Record<string, number>;
  }>;
  total_aggregated_value?: number;
}

export interface IssueResult {
  tick: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL_REVIEW_REQUIRED';
  trigger: string | null;
  text_box_content: string | null;
  documents_to_attach: string[];
  [key: string]: unknown;
}

export interface GroupingIssueResult {
  valued_together: {
    tick: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL_REVIEW_REQUIRED';
    trigger?: string | null;
    text_box_content?: string | null;
    documents_to_attach?: string[];
  };
  valued_separately: {
    tick: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL_REVIEW_REQUIRED';
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

export interface CadastreFeature {
  lot: string | null;
  plan: string | null;
  planType: string;
  areaM2: number | null;
  cadId: string | null;
}
