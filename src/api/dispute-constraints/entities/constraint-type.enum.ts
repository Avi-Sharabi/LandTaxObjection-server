export enum ConstraintType {
  // Physical/legal property constraints
  HERITAGE_LISTING                   = 'heritage_listing',
  FLOOD_ZONE_100YR                   = 'flood_zone_100yr',
  BUSHFIRE_BAL_RESTRICTION           = 'bushfire_bal_restriction',
  EASEMENT_OR_RIGHT_OF_WAY           = 'easement_or_right_of_way',
  ENVIRONMENTAL_CONSERVATION_OVERLAY = 'environmental_conservation_overlay',
  ZONING_PLANNING_RESTRICTION        = 'zoning_planning_restriction',
  ACCESS_RESTRICTION_LANDLOCKED      = 'access_restriction_landlocked',
  CONTAMINATION_REMEDIATION          = 'contamination_remediation',
  // Evidence folder categories
  COMPARABLE_SALES                   = 'comparable_sales',
  MARKET_VALUE                       = 'market_value',
  LAND_USE                           = 'land_use',
  OTHER                              = 'other',
}
