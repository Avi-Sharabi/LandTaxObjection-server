import { User, UserRole } from 'src/api/users/entities/user.entity';
import { DataSource } from 'typeorm';

export async function seedUsers(dataSource: DataSource): Promise<void> {
    const userRepository = dataSource.getRepository(User);

    const users: Partial<User>[] = [
        {
            email: 'uraman2000@gmail.com',
            full_name: 'Pol Imbing',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            is_active: true,
        },
        {
            email: 'ArvinJamesBermudes21@gmail.com',
            full_name: 'Arvin James Bermudes',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            is_active: true,
        },
        {
            email: 'april.clemente@ymlgroup.com.au',
            full_name: 'April Clemente',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            is_active: true,
        },
        {
            email: 'avi.sharabi@ymlgroup.com.au',
            full_name: 'Avi Sharabi',
            role: UserRole.ACCOUNTANT,
            phone: '+61 2 1234 5678',
            is_active: true,
        },
        {
            email: 'landtaxdispute@ymlgroup.com.au',
            full_name: 'Internal Assessor',
            role: UserRole.INTERNAL_Assessor,
            phone: '+61 2 1234 5678',
            is_active: true,
        },
    ];

    for (const userData of users) {
        const exists = await userRepository.findOneBy({ email: userData.email });
        if (!exists) {
            await userRepository.save(userRepository.create(userData));
            console.log(`✅ Seeded user: ${userData.email}`);
        } else {
            console.log(`⚠️  Skipped (already exists): ${userData.email}`);
        }
    }
}