import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { seedUsers } from './user.seeder';
import { seedObjectionPackage } from './objection-package.seeder';

const logger = new Logger('Seed');

async function runSeeders(dataSource: DataSource): Promise<void> {
    await seedUsers(dataSource);
    await seedObjectionPackage(dataSource);
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
