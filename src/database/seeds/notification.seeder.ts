import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Notification } from 'src/api/notifications/entities/notification.entity';
import { User } from 'src/api/users/entities/user.entity';

// Seeded dispute case from objection-package.seeder.ts
const SEED_CASE_ID = 'a4000000-0000-0000-0000-000000000001';

// Fixed UUIDs — seeder is idempotent; re-running is safe
const SEED_NOTIFICATION_IDS = {
  deadlineAlert7Days:  'b1000000-0000-0000-0000-000000000001',
  caseUpdate:          'b1000000-0000-0000-0000-000000000002',
  deadlineAlert14Days: 'b1000000-0000-0000-0000-000000000003',
};

const logger = new Logger('NotificationSeeder');

export async function seedNotifications(dataSource: DataSource): Promise<void> {
  const notificationRepo = dataSource.getRepository(Notification);
  const userRepo = dataSource.getRepository(User);

  // Resolve the target user dynamically so this seeder is not coupled to a
  // hardcoded user UUID (users are seeded with bcrypt-hashed passwords and
  // their UUIDs are DB-generated, not fixed).
  const user = await userRepo.findOneBy({ email: 'arvin.bermudez@ymlgroup.com.au' });
  if (!user) {
    logger.warn('Target user arvin.bermudez@ymlgroup.com.au not found — skipping notification seed. Run user seeder first.');
    return;
  }

  const notifications: { id: string; type: string; message: string }[] = [
    {
      id: SEED_NOTIFICATION_IDS.deadlineAlert7Days,
      type: 'deadline_alert',
      message: 'Statutory deadline in 7 days for SEED-OBJ-001',
    },
    {
      id: SEED_NOTIFICATION_IDS.caseUpdate,
      type: 'case_update',
      message: 'Objection package is ready for client approval on SEED-OBJ-001',
    },
    {
      id: SEED_NOTIFICATION_IDS.deadlineAlert14Days,
      type: 'deadline_alert',
      message: 'Statutory deadline in 14 days for SEED-OBJ-001',
    },
  ];

  let seeded = 0;
  let skipped = 0;

  for (const { id, type, message } of notifications) {
    const existing = await notificationRepo.findOneBy({ id });
    if (existing) {
      skipped++;
      continue;
    }

    await notificationRepo.save(
      notificationRepo.create({
        id,
        userId: user.id,
        type,
        message,
        caseId: SEED_CASE_ID,
        read: false,
      }),
    );
    seeded++;
  }

  if (seeded > 0) {
    logger.log(`Seeded ${seeded} notifications for ${user.email}`);
    logger.log(`\n  → Test with: GET /api/v1/notifications (logged in as arvin.bermudez@ymlgroup.com.au)`);
    logger.log(`  → Stream with: GET /api/v1/notifications/stream`);
  }
  if (skipped > 0) {
    logger.log(`Skipped ${skipped} notifications (already exist)`);
  }
}
