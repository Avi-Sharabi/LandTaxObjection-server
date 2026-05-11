import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';
import { Property } from 'src/api/properties/entities/property.entity';
import { ValuationNotice } from 'src/api/valuation-notices/entities/valuation-notice.entity';
import { DisputeCase, DisputeStatus, Jurisdiction } from 'src/api/dispute-cases/entities/dispute-case.entity';

const logger = new Logger('CasesPaginationSeeder');

// ─── 6 shared clients (5 cases each = 30 total) ────────────────────────────────

const CLIENTS = [
  { id: 'b1000000-0000-0000-0000-000000000001', name: 'Hartley Property Group',   email: 'hartley.pg@paginationseed.test',   region: 'NSW' },
  { id: 'b1000000-0000-0000-0000-000000000002', name: 'Nguyen Family Holdings',   email: 'nguyen.fam@paginationseed.test',   region: 'VIC' },
  { id: 'b1000000-0000-0000-0000-000000000003', name: 'Patel Commercial Pty Ltd', email: 'patel.comm@paginationseed.test',   region: 'QLD' },
  { id: 'b1000000-0000-0000-0000-000000000004', name: 'Marino Developments',      email: 'marino.dev@paginationseed.test',   region: 'WA'  },
  { id: 'b1000000-0000-0000-0000-000000000005', name: 'Chen Land Trust',          email: 'chen.land@paginationseed.test',    region: 'NSW' },
  { id: 'b1000000-0000-0000-0000-000000000006', name: 'Kowalski Investments NSW', email: 'kowalski.nsw@paginationseed.test', region: 'NSW' },
];

// ─── 30 cases ──────────────────────────────────────────────────────────────────
//
// Groups 1–5 (cases 01–25) use fixed deadlines:
//   Future  → 2026-06 onward          (passes dashboardFilter=active)
//   Overdue → 2025-11 to 2026-03      (passes dashboardFilter=overdue)
//
// Group 6 (cases 26–30) deadlines are computed at seed time so the
// "due_this_week" test coverage never becomes stale (see seedCasesPagination).

const STATIC_CASES = [
  // ── Group 1: NSW — future deadlines (cases 01–05) ──────────────────────────
  {
    clientId: 'b1000000-0000-0000-0000-000000000001',
    propertyId: 'b2000000-0000-0000-0000-000000000001',
    noticeId:   'b3000000-0000-0000-0000-000000000001',
    caseId:     'b4000000-0000-0000-0000-000000000001',
    property: { address: '1 Pitt Street',       suburb: 'Sydney',     state: Jurisdiction.NSW, postcode: '2000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 1_850_000 },
    case:     { case_reference: 'SEED-PAG-001', status: DisputeStatus.DRAFT,                   statutory_deadline: '2026-06-15', jurisdiction: Jurisdiction.NSW },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000001',
    propertyId: 'b2000000-0000-0000-0000-000000000002',
    noticeId:   'b3000000-0000-0000-0000-000000000002',
    caseId:     'b4000000-0000-0000-0000-000000000002',
    property: { address: '25 George Street',    suburb: 'Sydney',     state: Jurisdiction.NSW, postcode: '2000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 2_400_000 },
    case:     { case_reference: 'SEED-PAG-002', status: DisputeStatus.GROUNDS_SELECTION,       statutory_deadline: '2026-07-01', jurisdiction: Jurisdiction.NSW },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000001',
    propertyId: 'b2000000-0000-0000-0000-000000000003',
    noticeId:   'b3000000-0000-0000-0000-000000000003',
    caseId:     'b4000000-0000-0000-0000-000000000003',
    property: { address: '88 Elizabeth Street', suburb: 'Sydney',     state: Jurisdiction.NSW, postcode: '2000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 3_100_000 },
    case:     { case_reference: 'SEED-PAG-003', status: DisputeStatus.EVIDENCE_COMPILATION,   statutory_deadline: '2026-07-30', jurisdiction: Jurisdiction.NSW },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000001',
    propertyId: 'b2000000-0000-0000-0000-000000000004',
    noticeId:   'b3000000-0000-0000-0000-000000000004',
    caseId:     'b4000000-0000-0000-0000-000000000004',
    property: { address: '12 Hunter Street',    suburb: 'Parramatta', state: Jurisdiction.NSW, postcode: '2150' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 980_000 },
    case:     { case_reference: 'SEED-PAG-004', status: DisputeStatus.APPRAISAL,              statutory_deadline: '2026-08-15', jurisdiction: Jurisdiction.NSW },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000001',
    propertyId: 'b2000000-0000-0000-0000-000000000005',
    noticeId:   'b3000000-0000-0000-0000-000000000005',
    caseId:     'b4000000-0000-0000-0000-000000000005',
    property: { address: '300 Victoria Avenue', suburb: 'Chatswood',  state: Jurisdiction.NSW, postcode: '2067' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 5_500_000 },
    case:     { case_reference: 'SEED-PAG-005', status: DisputeStatus.ADVISORY_LETTER_ISSUED, statutory_deadline: '2026-09-01', jurisdiction: Jurisdiction.NSW },
  },

  // ── Group 2: VIC — future deadlines (cases 06–10) ──────────────────────────
  {
    clientId: 'b1000000-0000-0000-0000-000000000002',
    propertyId: 'b2000000-0000-0000-0000-000000000006',
    noticeId:   'b3000000-0000-0000-0000-000000000006',
    caseId:     'b4000000-0000-0000-0000-000000000006',
    property: { address: '5 Collins Street',    suburb: 'Melbourne',  state: Jurisdiction.VIC, postcode: '3000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 7_200_000 },
    case:     { case_reference: 'SEED-PAG-006', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2026-09-15', jurisdiction: Jurisdiction.VIC },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000002',
    propertyId: 'b2000000-0000-0000-0000-000000000007',
    noticeId:   'b3000000-0000-0000-0000-000000000007',
    caseId:     'b4000000-0000-0000-0000-000000000007',
    property: { address: '120 Spencer Street',  suburb: 'Melbourne',  state: Jurisdiction.VIC, postcode: '3000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 4_300_000 },
    case:     { case_reference: 'SEED-PAG-007', status: DisputeStatus.AWAITING_CLIENT_APPROVAL, statutory_deadline: '2026-10-01', jurisdiction: Jurisdiction.VIC },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000002',
    propertyId: 'b2000000-0000-0000-0000-000000000008',
    noticeId:   'b3000000-0000-0000-0000-000000000008',
    caseId:     'b4000000-0000-0000-0000-000000000008',
    property: { address: '50 Flinders Lane',    suburb: 'Melbourne',  state: Jurisdiction.VIC, postcode: '3000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 2_750_000 },
    case:     { case_reference: 'SEED-PAG-008', status: DisputeStatus.CLIENT_APPROVED,          statutory_deadline: '2026-10-15', jurisdiction: Jurisdiction.VIC },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000002',
    propertyId: 'b2000000-0000-0000-0000-000000000009',
    noticeId:   'b3000000-0000-0000-0000-000000000009',
    caseId:     'b4000000-0000-0000-0000-000000000009',
    property: { address: '10 Bourke Street',    suburb: 'Docklands',  state: Jurisdiction.VIC, postcode: '3008' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 6_800_000 },
    case:     { case_reference: 'SEED-PAG-009', status: DisputeStatus.SUBMITTED_TO_VG,          statutory_deadline: '2026-11-01', jurisdiction: Jurisdiction.VIC },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000002',
    propertyId: 'b2000000-0000-0000-0000-000000000010',
    noticeId:   'b3000000-0000-0000-0000-000000000010',
    caseId:     'b4000000-0000-0000-0000-000000000010',
    property: { address: '77 William Street',   suburb: 'Fitzroy',    state: Jurisdiction.VIC, postcode: '3065' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 1_200_000 },
    case:     { case_reference: 'SEED-PAG-010', status: DisputeStatus.SUBMITTED_TO_VG,     statutory_deadline: '2026-11-15', jurisdiction: Jurisdiction.VIC },
  },

  // ── Group 3: QLD — future deadlines (cases 11–15) ──────────────────────────
  {
    clientId: 'b1000000-0000-0000-0000-000000000003',
    propertyId: 'b2000000-0000-0000-0000-000000000011',
    noticeId:   'b3000000-0000-0000-0000-000000000011',
    caseId:     'b4000000-0000-0000-0000-000000000011',
    property: { address: '88 Queen Street',     suburb: 'Brisbane',   state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 3_600_000 },
    case:     { case_reference: 'SEED-PAG-011', status: DisputeStatus.OUTCOME_RECEIVED,        statutory_deadline: '2026-12-01', jurisdiction: Jurisdiction.QLD },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000003',
    propertyId: 'b2000000-0000-0000-0000-000000000012',
    noticeId:   'b3000000-0000-0000-0000-000000000012',
    caseId:     'b4000000-0000-0000-0000-000000000012',
    property: { address: '21 Ann Street',       suburb: 'Fortitude Valley', state: Jurisdiction.QLD, postcode: '4006' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 1_100_000 },
    case:     { case_reference: 'SEED-PAG-012', status: DisputeStatus.CLOSED,                  statutory_deadline: '2026-12-15', jurisdiction: Jurisdiction.QLD },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000003',
    propertyId: 'b2000000-0000-0000-0000-000000000013',
    noticeId:   'b3000000-0000-0000-0000-000000000013',
    caseId:     'b4000000-0000-0000-0000-000000000013',
    property: { address: '9 Eagle Street',      suburb: 'Brisbane City', state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 8_900_000 },
    case:     { case_reference: 'SEED-PAG-013', status: DisputeStatus.CLOSED_NO_OBJECTION,     statutory_deadline: '2027-01-15', jurisdiction: Jurisdiction.QLD },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000003',
    propertyId: 'b2000000-0000-0000-0000-000000000014',
    noticeId:   'b3000000-0000-0000-0000-000000000014',
    caseId:     'b4000000-0000-0000-0000-000000000014',
    property: { address: '33 Charlotte Street', suburb: 'Brisbane',   state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 2_050_000 },
    case:     { case_reference: 'SEED-PAG-014', status: DisputeStatus.DRAFT,                   statutory_deadline: '2027-02-01', jurisdiction: Jurisdiction.QLD },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000003',
    propertyId: 'b2000000-0000-0000-0000-000000000015',
    noticeId:   'b3000000-0000-0000-0000-000000000015',
    caseId:     'b4000000-0000-0000-0000-000000000015',
    property: { address: '60 Creek Street',     suburb: 'Brisbane',   state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 4_750_000 },
    case:     { case_reference: 'SEED-PAG-015', status: DisputeStatus.GROUNDS_SELECTION,       statutory_deadline: '2027-02-28', jurisdiction: Jurisdiction.QLD },
  },

  // ── Group 4: WA — future deadlines (cases 16–20) ───────────────────────────
  {
    clientId: 'b1000000-0000-0000-0000-000000000004',
    propertyId: 'b2000000-0000-0000-0000-000000000016',
    noticeId:   'b3000000-0000-0000-0000-000000000016',
    caseId:     'b4000000-0000-0000-0000-000000000016',
    property: { address: '3 St Georges Terrace', suburb: 'Perth',     state: Jurisdiction.WA,  postcode: '6000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 3_300_000 },
    case:     { case_reference: 'SEED-PAG-016', status: DisputeStatus.EVIDENCE_COMPILATION,   statutory_deadline: '2026-06-30', jurisdiction: Jurisdiction.WA },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000004',
    propertyId: 'b2000000-0000-0000-0000-000000000017',
    noticeId:   'b3000000-0000-0000-0000-000000000017',
    caseId:     'b4000000-0000-0000-0000-000000000017',
    property: { address: '100 Murray Street',   suburb: 'Perth',     state: Jurisdiction.WA,  postcode: '6000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 1_750_000 },
    case:     { case_reference: 'SEED-PAG-017', status: DisputeStatus.APPRAISAL,              statutory_deadline: '2026-08-01', jurisdiction: Jurisdiction.WA },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000004',
    propertyId: 'b2000000-0000-0000-0000-000000000018',
    noticeId:   'b3000000-0000-0000-0000-000000000018',
    caseId:     'b4000000-0000-0000-0000-000000000018',
    property: { address: '45 Hay Street',       suburb: 'Subiaco',   state: Jurisdiction.WA,  postcode: '6008' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 2_900_000 },
    case:     { case_reference: 'SEED-PAG-018', status: DisputeStatus.ADVISORY_LETTER_ISSUED, statutory_deadline: '2026-09-30', jurisdiction: Jurisdiction.WA },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000004',
    propertyId: 'b2000000-0000-0000-0000-000000000019',
    noticeId:   'b3000000-0000-0000-0000-000000000019',
    caseId:     'b4000000-0000-0000-0000-000000000019',
    property: { address: '18 Mount Street',     suburb: 'Perth',     state: Jurisdiction.WA,  postcode: '6000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 6_150_000 },
    case:     { case_reference: 'SEED-PAG-019', status: DisputeStatus.AWAITING_CLIENT_APPROVAL, statutory_deadline: '2026-10-31', jurisdiction: Jurisdiction.WA },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000004',
    propertyId: 'b2000000-0000-0000-0000-000000000020',
    noticeId:   'b3000000-0000-0000-0000-000000000020',
    caseId:     'b4000000-0000-0000-0000-000000000020',
    property: { address: '250 St Georges Tce',  suburb: 'Perth',     state: Jurisdiction.WA,  postcode: '6000' },
    notice:   { valuation_date: '2026-01-15', assessed_land_value: 4_400_000 },
    case:     { case_reference: 'SEED-PAG-020', status: DisputeStatus.SUBMITTED_TO_VG,         statutory_deadline: '2026-11-30', jurisdiction: Jurisdiction.WA },
  },

  // ── Group 5: Mixed jurisdictions — OVERDUE deadlines (cases 21–25) ──────────
  {
    clientId: 'b1000000-0000-0000-0000-000000000005',
    propertyId: 'b2000000-0000-0000-0000-000000000021',
    noticeId:   'b3000000-0000-0000-0000-000000000021',
    caseId:     'b4000000-0000-0000-0000-000000000021',
    property: { address: '50 Clarence Street',  suburb: 'Sydney',    state: Jurisdiction.NSW, postcode: '2000' },
    notice:   { valuation_date: '2025-10-01', assessed_land_value: 2_200_000 },
    case:     { case_reference: 'SEED-PAG-021', status: DisputeStatus.SUBMITTED_TO_VG,         statutory_deadline: '2025-11-30', jurisdiction: Jurisdiction.NSW },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000005',
    propertyId: 'b2000000-0000-0000-0000-000000000022',
    noticeId:   'b3000000-0000-0000-0000-000000000022',
    caseId:     'b4000000-0000-0000-0000-000000000022',
    property: { address: '8 Exhibition Street', suburb: 'Melbourne',  state: Jurisdiction.VIC, postcode: '3000' },
    notice:   { valuation_date: '2025-10-01', assessed_land_value: 3_800_000 },
    case:     { case_reference: 'SEED-PAG-022', status: DisputeStatus.SUBMITTED_TO_VG,    statutory_deadline: '2025-12-31', jurisdiction: Jurisdiction.VIC },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000005',
    propertyId: 'b2000000-0000-0000-0000-000000000023',
    noticeId:   'b3000000-0000-0000-0000-000000000023',
    caseId:     'b4000000-0000-0000-0000-000000000023',
    property: { address: '41 Edward Street',    suburb: 'Brisbane',   state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2025-11-01', assessed_land_value: 1_450_000 },
    case:     { case_reference: 'SEED-PAG-023', status: DisputeStatus.EVIDENCE_COMPILATION,   statutory_deadline: '2026-01-15', jurisdiction: Jurisdiction.QLD },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000005',
    propertyId: 'b2000000-0000-0000-0000-000000000024',
    noticeId:   'b3000000-0000-0000-0000-000000000024',
    caseId:     'b4000000-0000-0000-0000-000000000024',
    property: { address: '6 Barrack Street',    suburb: 'Perth',      state: Jurisdiction.WA,  postcode: '6000' },
    notice:   { valuation_date: '2025-11-01', assessed_land_value: 5_000_000 },
    case:     { case_reference: 'SEED-PAG-024', status: DisputeStatus.DRAFT,                   statutory_deadline: '2026-02-15', jurisdiction: Jurisdiction.WA },
  },
  {
    clientId: 'b1000000-0000-0000-0000-000000000005',
    propertyId: 'b2000000-0000-0000-0000-000000000025',
    noticeId:   'b3000000-0000-0000-0000-000000000025',
    caseId:     'b4000000-0000-0000-0000-000000000025',
    property: { address: '200 Mary Street',     suburb: 'Brisbane',   state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2025-12-01', assessed_land_value: 2_600_000 },
    case:     { case_reference: 'SEED-PAG-025', status: DisputeStatus.APPRAISAL,              statutory_deadline: '2026-03-01', jurisdiction: Jurisdiction.QLD },
  },

];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isoDatePlusDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Seeder ────────────────────────────────────────────────────────────────────

export async function seedCasesPagination(dataSource: DataSource): Promise<void> {
  const clientRepo          = dataSource.getRepository(Client);
  const propertyRepo        = dataSource.getRepository(Property);
  const valuationNoticeRepo = dataSource.getRepository(ValuationNotice);
  const disputeCaseRepo     = dataSource.getRepository(DisputeCase);

  // ── Group 6: DUE THIS WEEK — deadlines relative to today ─────────────────────
  const today = new Date();
  const DUE_THIS_WEEK_CASES = [
    {
      clientId: 'b1000000-0000-0000-0000-000000000006',
      propertyId: 'b2000000-0000-0000-0000-000000000026',
      noticeId:   'b3000000-0000-0000-0000-000000000026',
      caseId:     'b4000000-0000-0000-0000-000000000026',
      property: { address: '15 Bridge Street',      suburb: 'Sydney',    state: Jurisdiction.NSW, postcode: '2000' },
      notice:   { valuation_date: '2026-02-22', assessed_land_value: 3_250_000 },
      case:     { case_reference: 'SEED-PAG-026', status: DisputeStatus.APPRAISAL,                 statutory_deadline: isoDatePlusDays(today, 0), jurisdiction: Jurisdiction.NSW },
    },
    {
      clientId: 'b1000000-0000-0000-0000-000000000006',
      propertyId: 'b2000000-0000-0000-0000-000000000027',
      noticeId:   'b3000000-0000-0000-0000-000000000027',
      caseId:     'b4000000-0000-0000-0000-000000000027',
      property: { address: '72 Swanston Street',    suburb: 'Melbourne', state: Jurisdiction.VIC, postcode: '3000' },
      notice:   { valuation_date: '2026-02-24', assessed_land_value: 1_900_000 },
      case:     { case_reference: 'SEED-PAG-027', status: DisputeStatus.AWAITING_CLIENT_APPROVAL,  statutory_deadline: isoDatePlusDays(today, 2), jurisdiction: Jurisdiction.VIC },
    },
    {
      clientId: 'b1000000-0000-0000-0000-000000000006',
      propertyId: 'b2000000-0000-0000-0000-000000000028',
      noticeId:   'b3000000-0000-0000-0000-000000000028',
      caseId:     'b4000000-0000-0000-0000-000000000028',
      property: { address: '55 Adelaide Street',   suburb: 'Brisbane',  state: Jurisdiction.QLD, postcode: '4000' },
      notice:   { valuation_date: '2026-02-26', assessed_land_value: 4_100_000 },
      case:     { case_reference: 'SEED-PAG-028', status: DisputeStatus.GROUNDS_SELECTION,         statutory_deadline: isoDatePlusDays(today, 4), jurisdiction: Jurisdiction.QLD },
    },
    {
      clientId: 'b1000000-0000-0000-0000-000000000006',
      propertyId: 'b2000000-0000-0000-0000-000000000029',
      noticeId:   'b3000000-0000-0000-0000-000000000029',
      caseId:     'b4000000-0000-0000-0000-000000000029',
      property: { address: '9 Wellington Street',  suburb: 'Perth',     state: Jurisdiction.WA,  postcode: '6000' },
      notice:   { valuation_date: '2026-02-28', assessed_land_value: 2_350_000 },
      case:     { case_reference: 'SEED-PAG-029', status: DisputeStatus.DRAFT,                     statutory_deadline: isoDatePlusDays(today, 5), jurisdiction: Jurisdiction.WA  },
    },
    {
      clientId: 'b1000000-0000-0000-0000-000000000006',
      propertyId: 'b2000000-0000-0000-0000-000000000030',
      noticeId:   'b3000000-0000-0000-0000-000000000030',
      caseId:     'b4000000-0000-0000-0000-000000000030',
      property: { address: '42 Castlereagh Street', suburb: 'Sydney',   state: Jurisdiction.NSW, postcode: '2000' },
      notice:   { valuation_date: '2026-02-28', assessed_land_value: 7_800_000 },
      case:     { case_reference: 'SEED-PAG-030', status: DisputeStatus.EVIDENCE_COMPILATION,      statutory_deadline: isoDatePlusDays(today, 6), jurisdiction: Jurisdiction.NSW },
    },
  ];

  const CASES = [...STATIC_CASES, ...DUE_THIS_WEEK_CASES];

  // ── Clients ──────────────────────────────────────────────────────────────────
  for (const c of CLIENTS) {
    const exists = await clientRepo.findOneBy({ id: c.id });
    if (!exists) {
      await clientRepo.save(clientRepo.create({ id: c.id, name: c.name, email: c.email, status: ClientStatus.ACTIVE }));
      logger.log(`Seeded client: ${c.name}`);
    } else {
      logger.log(`Skipped client (already exists): ${c.name}`);
    }
  }

  // ── Properties / Notices / Cases ─────────────────────────────────────────────
  for (const seed of CASES) {
    // Property
    let property = await propertyRepo.findOneBy({ id: seed.propertyId });
    if (!property) {
      property = await propertyRepo.save(
        propertyRepo.create({
          id: seed.propertyId,
          client_id: seed.clientId,
          address: seed.property.address,
          suburb: seed.property.suburb,
          state: seed.property.state,
          postcode: seed.property.postcode,
        }),
      );
      logger.log(`Seeded property: ${seed.property.address}`);
    }

    // Valuation Notice
    let notice = await valuationNoticeRepo.findOneBy({ id: seed.noticeId });
    if (!notice) {
      notice = await valuationNoticeRepo.save(
        valuationNoticeRepo.create({
          id: seed.noticeId,
          property_id: property.id,
          valuation_date: new Date(seed.notice.valuation_date),
          assessed_land_value: seed.notice.assessed_land_value,
        }),
      );
      logger.log(`Seeded notice for ${seed.property.address}`);
    }

    // Dispute Case
    const existingCase = await disputeCaseRepo.findOneBy({ id: seed.caseId });
    if (!existingCase) {
      await disputeCaseRepo.save(
        disputeCaseRepo.create({
          id: seed.caseId,
          case_reference: seed.case.case_reference,
          client_id: seed.clientId,
          property_id: property.id,
          valuation_notice_id: notice.id,
          jurisdiction: seed.case.jurisdiction,
          status: seed.case.status,
          statutory_deadline: new Date(seed.case.statutory_deadline),
          original_assessed_value: seed.notice.assessed_land_value,
        }),
      );
      logger.log(`Seeded dispute case: ${seed.case.case_reference} [${seed.case.status}] deadline ${seed.case.statutory_deadline}`);
    } else {
      logger.log(`Skipped dispute case (already exists): ${seed.case.case_reference}`);
    }
  }

  logger.log('\n  Pagination test coverage:');
  logger.log('  → 30 cases total across 4 jurisdictions and all 13 statuses');
  logger.log('  → Cases 21–25: OVERDUE (deadline < 2026-04-23)');
  logger.log('  → Cases 26–30: DUE THIS WEEK (deadline 2026-04-24 to 2026-04-30)');
  logger.log('  → Cases 01–20: future deadlines (active)');
  logger.log('  → Test: GET /v1/dispute-cases/paginated?page=1&limit=10');
}
