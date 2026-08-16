// Plain interface + service-side mapping, matching the existing paginated
// list endpoints (see DisputeCasesService.findPaginated) rather than the
// @Expose()-decorated DTO pattern. Keys stay snake_case.
export interface PropertyListItem {
  id: string;
  pid: string | null;
  address: string | null;
  locality: string; // "Parramatta, NSW, 2150"
  zoning: string | null;
  lot_dp: string | null;
  dimensions: string | null;
  postcode: string | null;
  land_area_sqm: number | null;
  land_area_display: string | null; // "1,200 m²"
  land_area_eplanning_sqm: number | null;
  land_area_eplanning_display: string | null;
  ownership_pct: number | null;
  ownership_display: string | null; // "100.00%"
  height_limit_m: number | null;
  height_limit_display: string | null; // "9 m"
  created_at: Date;
  added_display: string; // "11 Aug 2026"
  cases: Array<{ id: string; case_reference: string }>;
}

export interface PaginatedPropertiesResult {
  data: PropertyListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
