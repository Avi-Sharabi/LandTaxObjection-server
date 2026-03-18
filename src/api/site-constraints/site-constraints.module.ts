import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SiteConstraint } from './entities/site-constraint.entity';
import { SiteConstraintsController } from './site-constraints.controller';
import { SiteConstraintsService } from './site-constraints.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteConstraint]),
  ],
  controllers: [SiteConstraintsController],
  providers: [SiteConstraintsService],
  exports: [SiteConstraintsService],
})
export class SiteConstraintsModule {}