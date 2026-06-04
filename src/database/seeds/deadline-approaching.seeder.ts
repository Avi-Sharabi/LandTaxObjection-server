import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';
import { Property } from 'src/api/properties/entities/property.entity';
import { ValuationNotice } from 'src/api/valuation-notices/entities/valuation-notice.entity';
import { DisputeCase, DisputeStatus, Jurisdiction } from 'src/api/dispute-cases/entities/dispute-case.entity';
import { User } from 'src/api/users/entities/user.entity';

const logger = new Logger('DeadlineApproachingSeeder');

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d;
}

// Fixed UUIDs in the c5... range to avoid conflicts with other seeders
const CLIENT_ID = 'c5000000-0000-0000-0000-000000000001';

const SEED_CASES = [
  {
    propertyId: 'c5000000-0000-0000-0000-000000000011',
    noticeId:   'c5000000-0000-0000-0000-000000000021',
    caseId:     'c5000000-0000-0000-0000-000000000031',
    address: '10 Martin Place', suburb: 'Sydney', state: Jurisdiction.NSW, postcode: '2000',
    caseRef: 'SEED-DL-001', daysOffset: 1,
    status: DisputeStatus.EVIDENCE_COMPILATION,
  },
  {
    propertyId: 'c5000000-0000-0000-0000-000000000012',
    noticeId:   'c5000000-0000-0000-0000-000000000022',
    caseId:     'c5000000-0000-0000-0000-000000000032',
    address: '22 King Street', suburb: 'Melbourne', state: Jurisdiction.VIC, postcode: '3000',
    caseRef: 'SEED-DL-002', daysOffset: 2,
    status: DisputeStatus.APPRAISAL,
  },
  {
    propertyId: 'c5000000-0000-0000-0000-000000000013',
    noticeId:   'c5000000-0000-0000-0000-000000000023',
    caseId:     'c5000000-0000-0000-0000-000000000033',
    address: '5 Eagle Street', suburb: 'Brisbane', state: Jurisdiction.QLD, postcode: '4000',
    caseRef: 'SEED-DL-003', daysOffset: 4,
    status: DisputeStatus.GROUNDS_SELECTION,
  },
  {
    propertyId: 'c5000000-0000-0000-0000-000000000014',
    noticeId:   'c5000000-0000-0000-0000-000000000024',
    caseId:     'c5000000-0000-0000-0000-000000000034',
    address: '9 Murray Street', suburb: 'Perth', state: Jurisdiction.WA, postcode: '6000',
    caseRef: 'SEED-DL-004', daysOffset: 5,
    status: DisputeStatus.AWAITING_CLIENT_APPROVAL,
  },
  {
    propertyId: 'c5000000-0000-0000-0000-000000000015',
    noticeId:   'c5000000-0000-0000-0000-000000000025',
    caseId:     'c5000000-0000-0000-0000-000000000035',
    address: '14 Rundle Mall', suburb: 'Adelaide', state: Jurisdiction.NSW, postcode: '5000',
    caseRef: 'SEED-DL-005', daysOffset: 6,
    status: DisputeStatus.DRAFT,
  },
];

export async function seedDeadlineApproaching(dataSource: DataSource): Promise<void> {
  const clientRepo   = dataSource.getRepository(Client);
  const propertyRepo = dataSource.getRepository(Property);
  const noticeRepo   = dataSource.getRepository(ValuationNotice);
  const caseRepo     = dataSource.getRepository(DisputeCase);
  const userRepo     = dataSource.getRepository(User);

  const owner = await userRepo.findOneBy({ email: 'arvin.bermudez@ymlgroup.com.au' });
  if (!owner) {
    logger.warn('Owner user not found — skipping deadline approaching seeder');
    return;
  }

  // Shared client for all approaching-deadline seed cases
  const existingClient = await clientRepo.findOneBy({ id: CLIENT_ID });
  if (!existingClient) {
    await clientRepo.save(
      clientRepo.create({
        id: CLIENT_ID,
        name: 'Deadline Test Client',
        email: 'deadline.test@seed.test',
        status: ClientStatus.ACTIVE,
      }),
    );
    logger.log('Seeded client: Deadline Test Client');
  }

  for (const seed of SEED_CASES) {
    // Property
    let property = await propertyRepo.findOneBy({ id: seed.propertyId });
    if (!property) {
      property = await propertyRepo.save(
        propertyRepo.create({
          id: seed.propertyId,
          client_id: CLIENT_ID,
          address: seed.address,
          suburb: seed.suburb,
          state: seed.state,
          postcode: seed.postcode,
        }),
      );
      logger.log(`Seeded property: ${seed.address}`);
    }

    // Valuation notice
    let notice = await noticeRepo.findOneBy({ id: seed.noticeId });
    if (!notice) {
      notice = await noticeRepo.save(
        noticeRepo.create({
          id: seed.noticeId,
          property_id: property.id,
          valuation_date: new Date('2026-01-15'),
          assessed_land_value: 2_500_000,
        }),
      );
      logger.log(`Seeded notice for ${seed.address}`);
    }

    // Dispute case — statutory_deadline relative to today, assigned_accountant_id set
    const existingCase = await caseRepo.findOneBy({ id: seed.caseId });
    if (!existingCase) {
      await caseRepo.save(
        caseRepo.create({
          id: seed.caseId,
          case_reference: seed.caseRef,
          client_id: CLIENT_ID,
          property_id: property.id,
          valuation_notice_id: notice.id,
          jurisdiction: seed.state as unknown as Jurisdiction,
          status: seed.status,
          statutory_deadline: daysFromNow(seed.daysOffset),
          original_assessed_value: 2_500_000,
          assigned_accountant_id: owner.id,
        }),
      );
      logger.log(`Seeded case: ${seed.caseRef} [${seed.status}] — statutory_deadline in ${seed.daysOffset}d`);
    } else {
      logger.log(`Skipped (already exists): ${seed.caseRef}`);
    }
  }
}
