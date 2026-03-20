import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { seedUsers } from './user.seeder';

async function runSeeders(dataSource: DataSource): Promise<void> {
    await seedUsers(dataSource);
    // await seedOtherEntity(dataSource); // add more seeders here
}

AppDataSource.initialize()
    .then(async (dataSource) => {
        console.log('🌱 Running seeders...');
        await runSeeders(dataSource);
        console.log('✅ Seeding complete.');
        await dataSource.destroy();
    })
    .catch((err) => {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    });