import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { seedUsers } from './user.seeder';
import { seedClients } from './client.seeder';
import { seedObjectionPackage } from './objection-package.seeder';
import { seedCaseClosedNoObjection } from './case-closed-no-objection.seeder';
import { seedInternalAssessedValueTest } from './internal-assessed-value-test.seeder';
import { seedVgMonitorTest } from './vg-monitor-test.seeder';
import { seedVgFollowUpTest } from './vg-follow-up-test.seeder';
import { seedSubmitToVG } from './submit-to-vg.seeder';
import { seedCasesPagination } from './cases-pagination.seeder';
import { seedComparablesTest } from './comparables-test.seeder';
import { seedObjectionReasonsTest } from './objection-reasons-test.seeder';
import { seedAccuracyTests } from './accuracy-test.seeder';
import { seedValuationReportTests } from './valuation-report-test.seeder';
import { seedLandTaxRates } from './land-tax-rates.seeder';
import { seedTaxSavingsTest } from './tax-savings-test.seeder';
import { testVgEmail } from './test-vg-email.seeder';
import { seedUpdateDatabaseTestFixture } from './update-database-test.seeder';
import { seedPropertySalesRaw } from './property-sales-raw.seeder';

const logger = new Logger('Seed');

async function runSeeders(dataSource: DataSource): Promise<void> {
  await seedUsers(dataSource);
  await seedLandTaxRates(dataSource);

  if (process.env.NODE_ENV !== 'production') {
    // First in the block: infrastructure, not a fixture. Creates property_sales_raw, which no
    // migration defines — without it the PSI import cannot run on a freshly reset database.
    await seedPropertySalesRaw(dataSource);

    await seedClients(dataSource);
    await seedObjectionPackage(dataSource);
    await seedCaseClosedNoObjection(dataSource);
    await seedInternalAssessedValueTest(dataSource);
    await seedVgMonitorTest(dataSource);
    await seedSubmitToVG(dataSource);
    await seedCasesPagination(dataSource);
    await seedComparablesTest(dataSource);
    await seedObjectionReasonsTest(dataSource);
    await seedAccuracyTests(dataSource);
    await seedValuationReportTests(dataSource);
    await seedTaxSavingsTest(dataSource);
    await testVgEmail(dataSource);
    await seedVgFollowUpTest(dataSource);
    await seedUpdateDatabaseTestFixture(dataSource);
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
