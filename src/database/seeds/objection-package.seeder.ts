import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';
import { Property } from 'src/api/properties/entities/property.entity';
import { ValuationNotice } from 'src/api/valuation-notices/entities/valuation-notice.entity';
import { DisputeCase, DisputeStatus, Jurisdiction } from 'src/api/dispute-cases/entities/dispute-case.entity';
import {
  PackageDocument,
  PackageDocumentCategory,
  PackageDocumentStatus,
} from 'src/api/objection-package/entities/package-document.entity';

const logger = new Logger('ObjectionPackageSeeder');

// ─── Seed data ────────────────────────────────────────────────────────────────

const CASES = [
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000001',
      property:        'a2000000-0000-0000-0000-000000000001',
      valuationNotice: 'a3000000-0000-0000-0000-000000000001',
      disputeCase:     'a4000000-0000-0000-0000-000000000001',
    },
    client:   { name: 'James Harrington',    email: 'arvin.bermudez@ymlgroup.com.au' },
    property: { address: '42 Mock Street',   suburb: 'Sydney',       state: Jurisdiction.NSW,  postcode: '2000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 1_200_000, appraised_value: 950_000,   valuation_delta: -250_000 },
    case:     { case_reference: 'SEED-OBJ-001', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-12-31', jurisdiction: Jurisdiction.NSW },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000002',
      property:        'a2000000-0000-0000-0000-000000000002',
      valuationNotice: 'a3000000-0000-0000-0000-000000000002',
      disputeCase:     'a4000000-0000-0000-0000-000000000002',
    },
    client:   { name: 'Sarah Chen',          email: 'pol.imbing@ymlgroup.com.au' },
    property: { address: '17 Harbour View',  suburb: 'Pyrmont',      state: Jurisdiction.NSW,  postcode: '2009' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 2_800_000, appraised_value: 2_100_000, valuation_delta: -700_000 },
    case:     { case_reference: 'SEED-OBJ-002', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-11-30', jurisdiction: Jurisdiction.NSW },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000003',
      property:        'a2000000-0000-0000-0000-000000000003',
      valuationNotice: 'a3000000-0000-0000-0000-000000000003',
      disputeCase:     'a4000000-0000-0000-0000-000000000003',
    },
    client:   { name: 'Michael Okafor',      email: 'pol.imbing@ymlgroup.com.au' },
    property: { address: '5 Collins Street', suburb: 'Melbourne',    state: Jurisdiction.VIC,  postcode: '3000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 3_500_000, appraised_value: 2_800_000, valuation_delta: -700_000 },
    case:     { case_reference: 'SEED-OBJ-003', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-10-15', jurisdiction: Jurisdiction.VIC },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000004',
      property:        'a2000000-0000-0000-0000-000000000004',
      valuationNotice: 'a3000000-0000-0000-0000-000000000004',
      disputeCase:     'a4000000-0000-0000-0000-000000000004',
    },
    client:   { name: 'Emily Nguyen',        email: 'pol.imbing@ymlgroup.com.au' },
    property: { address: '88 Queen Street',  suburb: 'Brisbane',     state: Jurisdiction.QLD,  postcode: '4000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 1_800_000, appraised_value: 1_400_000, valuation_delta: -400_000 },
    case:     { case_reference: 'SEED-OBJ-004', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-09-30', jurisdiction: Jurisdiction.QLD },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000005',
      property:        'a2000000-0000-0000-0000-000000000005',
      valuationNotice: 'a3000000-0000-0000-0000-000000000005',
      disputeCase:     'a4000000-0000-0000-0000-000000000005',
    },
    client:   { name: 'Robert Whitfield',    email: 'april.clemente@ymlgroup.com.au' },
    property: { address: '300 St Georges Tce', suburb: 'Perth',      state: Jurisdiction.WA,   postcode: '6000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 4_200_000, appraised_value: 3_500_000, valuation_delta: -700_000 },
    case:     { case_reference: 'SEED-OBJ-005', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-08-31', jurisdiction: Jurisdiction.WA },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000006',
      property:        'a2000000-0000-0000-0000-000000000006',
      valuationNotice: 'a3000000-0000-0000-0000-000000000006',
      disputeCase:     'a4000000-0000-0000-0000-000000000006',
    },
    client:   { name: 'Priya Sharma',        email: 'april.clemente@ymlgroup.com.au' },
    property: { address: '23 Crown Street',  suburb: 'Surry Hills',  state: Jurisdiction.NSW,  postcode: '2010' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 980_000,  appraised_value: 750_000,   valuation_delta: -230_000 },
    case:     { case_reference: 'SEED-OBJ-006', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-12-15', jurisdiction: Jurisdiction.NSW },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000007',
      property:        'a2000000-0000-0000-0000-000000000007',
      valuationNotice: 'a3000000-0000-0000-0000-000000000007',
      disputeCase:     'a4000000-0000-0000-0000-000000000007',
    },
    client:   { name: 'Thomas Vu',           email: 'pol.imbing@ymlgroup.com.au' },
    property: { address: '10 Spring Street', suburb: 'Melbourne',    state: Jurisdiction.VIC,  postcode: '3000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 6_000_000, appraised_value: 4_800_000, valuation_delta: -1_200_000 },
    case:     { case_reference: 'SEED-OBJ-007', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-11-01', jurisdiction: Jurisdiction.VIC },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000008',
      property:        'a2000000-0000-0000-0000-000000000008',
      valuationNotice: 'a3000000-0000-0000-0000-000000000008',
      disputeCase:     'a4000000-0000-0000-0000-000000000008',
    },
    client:   { name: 'Linda Kowalski',      email: 'april.clemente@ymlgroup.com.au' },
    property: { address: '9 Eagle Street',   suburb: 'Brisbane City', state: Jurisdiction.QLD, postcode: '4000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 2_200_000, appraised_value: 1_750_000, valuation_delta: -450_000 },
    case:     { case_reference: 'SEED-OBJ-008', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-10-31', jurisdiction: Jurisdiction.QLD },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000009',
      property:        'a2000000-0000-0000-0000-000000000009',
      valuationNotice: 'a3000000-0000-0000-0000-000000000009',
      disputeCase:     'a4000000-0000-0000-0000-000000000009',
    },
    client:   { name: 'David Papadopoulos',  email: 'april.clemente@ymlgroup.com.au' },
    property: { address: '55 Hay Street',    suburb: 'Subiaco',      state: Jurisdiction.WA,   postcode: '6008' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 1_600_000, appraised_value: 1_250_000, valuation_delta: -350_000 },
    case:     { case_reference: 'SEED-OBJ-009', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2025-09-15', jurisdiction: Jurisdiction.WA },
  },
  {
    ids: {
      client:          'a1000000-0000-0000-0000-000000000010',
      property:        'a2000000-0000-0000-0000-000000000010',
      valuationNotice: 'a3000000-0000-0000-0000-000000000010',
      disputeCase:     'a4000000-0000-0000-0000-000000000010',
    },
    client:   { name: 'Angela Tremblay',     email: 'april.clemente@ymlgroup.com.au' },
    property: { address: '1 Martin Place',   suburb: 'Sydney',       state: Jurisdiction.NSW,  postcode: '2000' },
    notice:   { valuation_date: '2024-07-01', assessed_land_value: 8_500_000, appraised_value: 7_000_000, valuation_delta: -1_500_000 },
    case:     { case_reference: 'SEED-OBJ-010', status: DisputeStatus.OBJECTION_PACKAGE_PREPARED, statutory_deadline: '2026-01-31', jurisdiction: Jurisdiction.NSW },
  },
];

// ─── Seeder ───────────────────────────────────────────────────────────────────

export async function seedObjectionPackage(dataSource: DataSource): Promise<void> {
  const clientRepo         = dataSource.getRepository(Client);
  const propertyRepo       = dataSource.getRepository(Property);
  const valuationNoticeRepo = dataSource.getRepository(ValuationNotice);
  const disputeCaseRepo    = dataSource.getRepository(DisputeCase);
  const packageDocumentRepo = dataSource.getRepository(PackageDocument);

  for (const seed of CASES) {
    const { ids } = seed;

    // ── Client ────────────────────────────────────────────────────────────────
    let client = await clientRepo.findOneBy({ id: ids.client });
    if (!client) {
      client = await clientRepo.save(
        clientRepo.create({
          id: ids.client,
          name: seed.client.name,
          email: seed.client.email,
          status: ClientStatus.ACTIVE,
        }),
      );
      logger.log(`Seeded client: ${seed.client.name}`);
    } else {
      logger.log(`Skipped client (already exists): ${seed.client.name}`);
    }

    // ── Property ──────────────────────────────────────────────────────────────
    let property = await propertyRepo.findOneBy({ id: ids.property });
    if (!property) {
      property = await propertyRepo.save(
        propertyRepo.create({
          id: ids.property,
          client_id: client.id,
          address: seed.property.address,
          suburb: seed.property.suburb,
          state: seed.property.state,
          postcode: seed.property.postcode,
        }),
      );
      logger.log(`Seeded property: ${seed.property.address}`);
    } else {
      logger.log(`Skipped property (already exists): ${seed.property.address}`);
    }

    // ── Valuation Notice ──────────────────────────────────────────────────────
    let valuationNotice = await valuationNoticeRepo.findOneBy({ id: ids.valuationNotice });
    if (!valuationNotice) {
      valuationNotice = await valuationNoticeRepo.save(
        valuationNoticeRepo.create({
          id: ids.valuationNotice,
          property_id: property.id,
          valuation_date: new Date(seed.notice.valuation_date),
          assessed_land_value: seed.notice.assessed_land_value,
          appraised_value: seed.notice.appraised_value,
          valuation_delta: seed.notice.valuation_delta,
        }),
      );
      logger.log(`Seeded valuation notice for ${seed.property.address}`);
    } else {
      logger.log(`Skipped valuation notice (already exists) for ${seed.property.address}`);
    }

    // ── Dispute Case ──────────────────────────────────────────────────────────
    let disputeCase = await disputeCaseRepo.findOneBy({ id: ids.disputeCase });
    if (!disputeCase) {
      disputeCase = await disputeCaseRepo.save(
        disputeCaseRepo.create({
          id: ids.disputeCase,
          case_reference: seed.case.case_reference,
          client_id: client.id,
          property_id: property.id,
          valuation_notice_id: valuationNotice.id,
          jurisdiction: seed.case.jurisdiction,
          status: seed.case.status,
          statutory_deadline: new Date(seed.case.statutory_deadline),
        }),
      );
      logger.log(`Seeded dispute case: ${disputeCase.case_reference}`);
    } else {
      if (disputeCase.status !== seed.case.status) {
        await disputeCaseRepo.update(disputeCase.id, { status: seed.case.status });
        logger.log(`Updated dispute case status: ${seed.case.case_reference} → ${seed.case.status}`);
      } else {
        logger.log(`Skipped dispute case (already exists): ${seed.case.case_reference}`);
      }
    }

    // ── Package Documents ─────────────────────────────────────────────────────
    const existing = await packageDocumentRepo.findBy({ dispute_case_id: ids.disputeCase });
    if (existing.length > 0) {
      logger.log(`Skipped package documents for ${seed.case.case_reference} (${existing.length} already exist)`);
      continue;
    }

    const now = new Date();
    const basePath = `clients/${client.id}/valuation-notices/${valuationNotice.id}/PackageDocument`;

    const documents: Partial<PackageDocument>[] = [
      {
        dispute_case_id: disputeCase.id,
        name: 'Notice of Objection',
        category: PackageDocumentCategory.NOTICE_OF_OBJECTION,
        status: PackageDocumentStatus.READY,
        blob_name: `${basePath}/notice-of-objection.pdf`,
        file_size_bytes: 245_760,
        generated_at: now,
      },
      {
        dispute_case_id: disputeCase.id,
        name: 'Comparable Sales Report',
        category: PackageDocumentCategory.COMPARABLE_SALES_REPORT,
        status: PackageDocumentStatus.READY,
        blob_name: `${basePath}/comparable-sales-report.pdf`,
        file_size_bytes: 512_000,
        generated_at: now,
      },
      {
        dispute_case_id: disputeCase.id,
        name: 'Mass Appraisal Deviation Report',
        category: PackageDocumentCategory.MASS_APPRAISAL_DEVIATION,
        status: PackageDocumentStatus.READY,
        blob_name: `${basePath}/mass-appraisal-deviation-report.pdf`,
        file_size_bytes: 300_000,
        generated_at: now,
      },
      {
        dispute_case_id: disputeCase.id,
        name: 'Site Constraints Summary',
        category: PackageDocumentCategory.SITE_CONSTRAINTS_SUMMARY,
        status: PackageDocumentStatus.READY,
        blob_name: `${basePath}/site-constraints-summary.pdf`,
        file_size_bytes: 200_000,
        generated_at: now,
      },
    ];

    for (const doc of documents) {
      await packageDocumentRepo.save(packageDocumentRepo.create(doc));
    }

    logger.log(`Seeded ${documents.length} package documents for ${seed.case.case_reference}`);
  }

  logger.log('\n  → Test with: GET /v1/dispute-cases/{id}/objection-package/documents');
}