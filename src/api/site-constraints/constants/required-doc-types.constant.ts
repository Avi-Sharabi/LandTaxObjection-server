import { ConstraintType } from '../entities/site-constraints.entity';

/**
 * Maps each ConstraintType to the document_type values that satisfy it.
 * Based on the `document_type` DB enum from the MVP schema.
 */
export const REQUIRED_DOC_TYPES: Record<ConstraintType, string[]> = {
  [ConstraintType.HERITAGE_LISTING]:                   ['legal_document', 'property_report'],
  [ConstraintType.FLOOD_ZONE_100YR]:                   ['property_report', 'other'],
  [ConstraintType.BUSHFIRE_BAL_RESTRICTION]:            ['property_report', 'other'],
  [ConstraintType.EASEMENT_OR_RIGHT_OF_WAY]:           ['land_title_search', 'legal_document'],
  [ConstraintType.ENVIRONMENTAL_CONSERVATION_OVERLAY]: ['property_report', 'other'],
  [ConstraintType.ZONING_PLANNING_RESTRICTION]:        ['property_report', 'legal_document'],
  [ConstraintType.ACCESS_RESTRICTION_LANDLOCKED]:      ['land_title_search', 'property_report'],
  [ConstraintType.CONTAMINATION_REMEDIATION]:          ['property_report', 'independent_valuation'],
  [ConstraintType.COMPARABLE_SALES]:                   ['other'],
  [ConstraintType.MARKET_VALUE]:                       ['independent_valuation', 'other'],
  [ConstraintType.LAND_USE]:                           ['property_report', 'other'],
  [ConstraintType.OTHER]:                              ['other'],
};