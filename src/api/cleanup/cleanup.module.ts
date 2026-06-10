import { Module } from '@nestjs/common';
import { HardDeleteCleanupTask } from './hard-delete-cleanup.task';

@Module({
  providers: [HardDeleteCleanupTask],
})
export class CleanupModule {}
