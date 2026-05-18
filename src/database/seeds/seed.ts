import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { seedUsers } from './user.seeder';
import { seedClients } from './client.seeder';
import { seedObjectionPackage } from './objection-package.seeder';
import { seedCaseClosedNoObjection } from './case-closed-no-objection.seeder';
import { seedNotifications } from './notification.seeder';
import { seedSubmitToVG } from './submit-to-vg.seeder';
import { seedCasesPagination } from './cases-pagination.seeder';
import { seedComparablesTest } from './comparables-test.seeder';
import { seedLandTaxRates } from './land-tax-rates.seeder';
import { seedTaxSavingsTest } from './tax-savings-test.seeder';
import { testVgEmail } from './test-vg-email.seeder';

const logger = new Logger('Seed');

async function runSeeders(dataSource: DataSource): Promise<void> {
  await seedUsers(dataSource);
  await seedLandTaxRates(dataSource);

  if (process.env.NODE_ENV !== 'production') {
    await seedClients(dataSource);
    await seedObjectionPackage(dataSource);
    await seedCaseClosedNoObjection(dataSource);
    await seedNotifications(dataSource);
    await seedSubmitToVG(dataSource);
    await seedCasesPagination(dataSource);
    await seedComparablesTest(dataSource);
    await seedTaxSavingsTest(dataSource);
    await testVgEmail(dataSource);
  }
}

AppDataSource.initialize()
  .then(async (dataSource) => {
    logger.log('Running seeders...');
    await runSeeders(dataSource);
    logger.log('Seeding complete.');
    await dataSource.destroy();
  })
  .catch((err) => {
    logger.error('Seeding failed:', err);
    process.exit(1);
  });
