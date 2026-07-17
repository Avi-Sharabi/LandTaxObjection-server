import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { ValuationNoticeExtractionDto } from '../dto/extract-valuation-notice.dto';

const EXTRACTION_SKILL_NAME = 'valuation-notice-extraction';

@Injectable()
export class DocumentExtractionHandler {
  private readonly logger = new Logger(DocumentExtractionHandler.name);

  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly skillRegistry: SkillRegistryService,
  ) { }

  async extractValuationNotice(base64Pdf: string): Promise<ValuationNoticeExtractionDto> {
    const buffer = Buffer.from(base64Pdf, 'base64');
    const { text } = await new PDFParse({ data: buffer }).getText();

    const result = await this.anthropicService.call({
      systemBlocks: [{ text: this.skillRegistry.getSkillContent(EXTRACTION_SKILL_NAME) }],
      userMessage: `DOCUMENT TEXT:\n${text}`,
    });

    try {
      // The skill returns one object per tax year found on the notice (e.g. a
      // notice covering "2024, 2025 Tax Years" returns two). The intake form
      // only has a single valuationYear field, so surface the most recent year.
      const byTaxYear = this.anthropicService.parseJsonArray<ValuationNoticeExtractionDto>(result.text);
      return byTaxYear.reduce((latest, current) =>
        Number(current.taxYear) > Number(latest.taxYear) ? current : latest,
      );
    } catch (e: unknown) {
      this.logger.error(`Failed to parse valuation notice extraction: ${(e as Error).message}`);
      throw e;
    }
  }
}
