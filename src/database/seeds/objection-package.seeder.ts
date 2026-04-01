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

// Fixed UUIDs — seeder is idempotent; re-running is safe
const SEED_IDS = {
  client: 'a1000000-0000-0000-0000-000000000001',
  property: 'a2000000-0000-0000-0000-000000000001',
  valuationNotice: 'a3000000-0000-0000-0000-000000000001',
  disputeCase: 'a4000000-0000-0000-0000-000000000001',
};

const logger = new Logger('ObjectionPackageSeeder');

export async function seedObjectionPackage(dataSource: DataSource): Promise<void> {
  const clientRepo = dataSource.getRepository(Client);
  const propertyRepo = dataSource.getRepository(Property);
  const valuationNoticeRepo = dataSource.getRepository(ValuationNotice);
  const disputeCaseRepo = dataSource.getRepository(DisputeCase);
  const packageDocumentRepo = dataSource.getRepository(PackageDocument);

  // ── 1. Client ──────────────────────────────────────────────────────────────

  let client = await clientRepo.findOneBy({ id: SEED_IDS.client });
  if (!client) {
    client = await clientRepo.save(
      clientRepo.create({
        id: SEED_IDS.client,
        name: 'Seed Client (Objection Package)',
        email: 'seed-client@example.com',
        status: ClientStatus.ACTIVE,
      }),
    );
    logger.log('Seeded client');
  } else {
    logger.log('Skipped client (already exists)');
  }

  // ── 2. Property ────────────────────────────────────────────────────────────

  let property = await propertyRepo.findOneBy({ id: SEED_IDS.property });
  if (!property) {
    property = await propertyRepo.save(
      propertyRepo.create({
        id: SEED_IDS.property,
        client_id: client.id,
        address: '42 Mock Street',
        suburb: 'Sydney',
        state: Jurisdiction.NSW,
        postcode: '2000',
      }),
    );
    logger.log('Seeded property');
  } else {
    logger.log('Skipped property (already exists)');
  }

  // ── 3. Valuation Notice ────────────────────────────────────────────────────

  let valuationNotice = await valuationNoticeRepo.findOneBy({ id: SEED_IDS.valuationNotice });
  if (!valuationNotice) {
    valuationNotice = await valuationNoticeRepo.save(
      valuationNoticeRepo.create({
        id: SEED_IDS.valuationNotice,
        property_id: property.id,
        valuation_date: new Date('2024-07-01'),
        assessed_land_value: 1_200_000,
        appraised_value: 950_000,
        valuation_delta: -250_000,
      }),
    );
    logger.log('Seeded valuation notice');
  } else {
    logger.log('Skipped valuation notice (already exists)');
  }

  // ── 4. Dispute Case ────────────────────────────────────────────────────────

  let disputeCase = await disputeCaseRepo.findOneBy({ id: SEED_IDS.disputeCase });
  if (!disputeCase) {
    disputeCase = await disputeCaseRepo.save(
      disputeCaseRepo.create({
        id: SEED_IDS.disputeCase,
        case_reference: 'SEED-OBJ-001',
        client_id: client.id,
        property_id: property.id,
        valuation_notice_id: valuationNotice.id,
        jurisdiction: Jurisdiction.NSW,
        status: DisputeStatus.OBJECTION_PACKAGE_PREPARED,
        statutory_deadline: new Date('2025-12-31'),
      }),
    );
    logger.log(`Seeded dispute case: ${disputeCase.id}`);
  } else {
    if (disputeCase.status !== DisputeStatus.OBJECTION_PACKAGE_PREPARED) {
      await disputeCaseRepo.update(disputeCase.id, {
        status: DisputeStatus.OBJECTION_PACKAGE_PREPARED,
      });
      logger.log('Updated existing dispute case status to OBJECTION_PACKAGE_PREPARED');
    } else {
      logger.log('Skipped dispute case (already exists)');
    }
  }

  // ── 5. Package Documents ───────────────────────────────────────────────────

  const existing = await packageDocumentRepo.findBy({ dispute_case_id: SEED_IDS.disputeCase });
  if (existing.length > 0) {
    logger.log(`Skipped package documents (${existing.length} already exist)`);
    return;
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

  logger.log(`Seeded ${documents.length} package documents for case ${disputeCase.id}`);
  logger.log(`\n  → Test with: GET /v1/dispute-cases/${disputeCase.id}/objection-package/documents`);
}
