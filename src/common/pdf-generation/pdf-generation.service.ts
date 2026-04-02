import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as htmlPdfNode from 'html-pdf-node';

export interface ValuationAnalysisReportData {
  caseReference: string;
  reportDate: string;
  propertyAddress: string;
  landAreaSqm: string;
  zoning: string;
  vgAssessedValue: string;
  internalAssessedValue: string;
  valuationDelta: string;
  valuationDate: string;
  analystNotes: string;
  appraisedAt: string;
  assessorFullName: string;
  assessorNotes: string;
  closedAt: string;
  comparables: string[];
  legalGrounds: string[];
  constraints: string[];
}

@Injectable()
export class PdfGenerationService {
  private readonly templateDir = path.join(
    __dirname,
    '..',
    'azure-email',
    'templates',
  );

  async generateValuationAnalysisReport(
    data: ValuationAnalysisReportData,
  ): Promise<Buffer> {
    const filePath = path.join(
      this.templateDir,
      'valuation-analysis-report.html',
    );
    let html = fs.readFileSync(filePath, 'utf-8');

    // Substitute {{#each list}}{{this}}{{/each}} blocks first
    const listFields: Array<keyof ValuationAnalysisReportData> = [
      'comparables',
      'legalGrounds',
      'constraints',
    ];
    for (const key of listFields) {
      const value = data[key] as string[];
      const blockRegex = new RegExp(
        `\\{\\{#each ${key}\\}\\}([\\s\\S]*?)\\{\\{/each\\}\\}`,
        'g',
      );
      html = html.replace(blockRegex, (_match, body: string) =>
        value.map((item) => body.replaceAll('{{this}}', item)).join(''),
      );
    }

    // Substitute scalar {{token}} values
    const scalarFields = Object.entries(data).filter(
      ([key]) => !listFields.includes(key as keyof ValuationAnalysisReportData),
    );
    for (const [key, value] of scalarFields) {
      html = html.replaceAll(`{{${key}}}`, value as string);
    }

    const pdfBuffer = await htmlPdfNode.generatePdf(
      { content: html },
      {
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    );

    return pdfBuffer;
  }
}
