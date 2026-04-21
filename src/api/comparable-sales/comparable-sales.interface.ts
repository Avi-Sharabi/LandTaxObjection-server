export interface ComparableSale {
  id: number;
  sourceFile: string | null;
  importedAt: Date | null;
  districtCode: string | null;
  propertyId: string | null;
  saleCounter: string | null;
  downloadDatetime: Date | null;
  propertyName: string | null;
  propertyUnitNumber: string | null;
  propertyHouseNumber: string | null;
  propertyStreetName: string | null;
  propertyLocality: string | null;
  propertyPostCode: string | null;
  area: number | null;
  contractDate: Date | null;
  settlementDate: Date | null;
  purchasePrice: number | null;
  zoning: string | null;
  natureOfProperty: string | null;
  primaryPurpose: string | null;
  strataLotNumber: string | null;
  componentCode: string | null;
  saleCode: string | null;
  interestOfSalePercent: number | null;
  dealingNumber: string | null;
  ownerType: string | null;
  grossRatePerM2: number | null;
  areaDifference: number | null;
}

export interface ComparableSalesMeta {
  locality: string;
  street: string;
  houseNumber?: string;
  unitNumber?: string;
  subjectArea?: number;
  valuationDate: string;
  isStrata: boolean;
  monthsLookback: number;
  limit: number;
  totalReturned: number;
  correctionsApplied: string[];
  warnings: string[];
}

export interface ComparableSalesResponse {
  data: ComparableSale[];
  meta: ComparableSalesMeta;
}

export interface ComparableSalesAiQueryResponse {
  data: ComparableSale[];
  /** The parameterised SQL Claude generated — returned for transparency and debugging */
  generatedSql: string;
  paramCount: number;
}
