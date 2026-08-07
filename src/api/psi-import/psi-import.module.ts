import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PuppeteerService } from '../supporting-evidence/shared/puppeteer.service';
import { PropertySalesRaw } from './entities/property-sales-raw.entity';
import { PsiArchiveService } from './psi-archive.service';
import { PsiDatParserService } from './psi-dat-parser.service';
import { PsiDownloadService } from './psi-download.service';
import { PsiImportRepository } from './psi-import.repository';
import { PsiImportService } from './psi-import.service';
import { PsiImportTask } from './psi-import.task';
import { PsiScraperService } from './psi-scraper.service';

/**
 * Weekly ingestion of NSW Valuer General bulk Property Sales Information.
 *
 * No controller and no DTOs — the only entry point is the cron task, so there is no HTTP
 * boundary. Modelled on CleanupModule, the existing template for a scheduled-task-only module.
 *
 * PuppeteerService is provided directly rather than imported: it is a plain @Injectable with no
 * module-level state, and SupportingEvidenceModule does not export it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PropertySalesRaw])],
  providers: [
    PsiImportTask,
    PsiImportService,
    PsiImportRepository,
    PsiScraperService,
    PsiDownloadService,
    PsiArchiveService,
    PsiDatParserService,
    PuppeteerService,
  ],
})
export class PsiImportModule {}
