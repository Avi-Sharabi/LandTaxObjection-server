import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface AdvisoryLetterData {
  caseReference: string;
  clientName: string;
  clientEmail: string;
  propertyAddress: string;
  vgAssessedValue: string;
  internalAssessedValue: string;
  assessmentDate: string;
  assessorFullName: string;
  closedAt: string;
}

@Injectable()
export class LetterGenerationService {
  private readonly templateDir = path.join(
    __dirname,
    '../../common/azure-email/templates',
  );

  generateAdvisoryLetter(data: AdvisoryLetterData): string {
    const filePath = path.join(this.templateDir, 'advisory-letter.html');
    let html = fs.readFileSync(filePath, 'utf-8');

    for (const [key, value] of Object.entries(data)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }

    return html;
  }
}
