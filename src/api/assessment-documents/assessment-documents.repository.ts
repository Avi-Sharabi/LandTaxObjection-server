import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssessmentDocument } from './entities/assessment-document.entity';

@Injectable()
export class AssessmentDocumentsRepository {
  constructor(
    @InjectRepository(AssessmentDocument)
    private readonly assessmentDocumentRepo: Repository<AssessmentDocument>,
  ) {}

  /**
   * Column-limited lookup for the download path — only file_path (to locate the
   * blob) and document_name (to build the filename) are needed, so the rest of
   * the row is not fetched.
   */
  async findByIdForDownload(id: string): Promise<AssessmentDocument | null> {
    return this.assessmentDocumentRepo.findOne({
      where: { id },
      select: { id: true, file_path: true, document_name: true },
    });
  }
}
