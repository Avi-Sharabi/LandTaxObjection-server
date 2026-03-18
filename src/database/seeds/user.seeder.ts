import { User, UserRole } from 'src/api/users/entities/user.entity';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const DEFAULT_PASSWORD = 'Admin@123';

export async function seedUsers(dataSource: DataSource): Promise<void> {
    const userRepository = dataSource.getRepository(User);
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const users: Partial<User>[] = [
        {
            email: 'pol.imbing@ymlgroup.com.au',
            fullName: 'Pol Imbing',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            isActive: true,
            password: hashedPassword,
        },
        {
            email: 'arvin.bermudez@ymlgroup.com.au',
            fullName: 'Arvin James Bermudez',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            isActive: true,
            password: hashedPassword,
        },
        {
            email: 'april.clemente@ymlgroup.com.au',
            fullName: 'April Clemente',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            isActive: true,
            password: hashedPassword,
        },
        {
            email: 'avi.sharabi@ymlgroup.com.au',
            fullName: 'Avi Sharabi',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            isActive: true,
            password: hashedPassword,
        },
        {
            email: 'landtaxdispute@ymlgroup.com.au',
            fullName: 'Internal Assessor',
            role: UserRole.INTERNAL_Assessor,
            phone: '+61 2 1234 5678',
            isActive: true,
            password: hashedPassword,
        },
    ];

    for (const userData of users) {
        const exists = await userRepository.findOneBy({ email: userData.email });
        if (!exists) {
            await userRepository.save(userRepository.create(userData));
            console.log(`✅ Seeded user: ${userData.email}`);
        } else {
            // Update password if not set
            if (!exists.password) {
                await userRepository.update(exists.id, { password: hashedPassword });
                console.log(`🔑 Updated password for: ${userData.email}`);
            } else {
                console.log(`⚠️  Skipped (already exists): ${userData.email}`);
            }
        }
    }
}