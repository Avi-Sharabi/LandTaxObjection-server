import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from 'src/mcp/skill-registry.service';
import { ValuationNoticeExtractionDto } from '../dto/extract-valuation-notice.dto';

const EXTRACTION_SKILL_NAME = 'valuation-notice-extraction';
const PDF_MAGIC_BYTES = '%PDF-';

@Injectable()
export class DocumentExtractionHandler {
  private readonly logger = new Logger(DocumentExtractionHandler.name);

  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly skillRegistry: SkillRegistryService,
  ) { }

  async extractValuationNotice(base64Pdf: string): Promise<ValuationNoticeExtractionDto> {
    if (!this.isPdf(base64Pdf)) {
      throw new BadRequestException('Uploaded file is not a valid PDF.');
    }

    // Sent as a native PDF document block (not text-extracted first) so Claude can
    // read pages with no embedded text layer — e.g. scanned/photographed notices.
    const result = await this.anthropicService.call({
      systemBlocks: [{ text: this.skillRegistry.getSkillContent(EXTRACTION_SKILL_NAME) }],
      userMessage: 'Extract the data from this NSW Land Tax Assessment Notice PDF.',
      documents: [{ base64: base64Pdf }],
    });

    this.logger.log(JSON.stringify({
      context: 'DocumentExtraction.anthropic_response',
      stopReason: result.stopReason,
      outputTokens: result.usage.outputTokens,
    }));

    if (result.stopReason === 'max_tokens') {
      this.logger.error('Valuation notice extraction was truncated at the max_tokens limit.');
      throw new Error('Claude response was truncated at the max_tokens limit while extracting the valuation notice.');
    }

    try {
      // The skill returns one object per tax year found on the notice (e.g. a
      // notice covering "2024, 2025 Tax Years" returns two). The intake form
      // only has a single valuationYear field, so surface the most recent year.
      const byTaxYear = this.anthropicService.parseJsonArray<ValuationNoticeExtractionDto>(result.text);
      if (byTaxYear.length === 0) {
        throw new BadRequestException('No land tax assessment data found in this document.');
      }
      return byTaxYear.reduce((latest, current) =>
        Number(current.taxYear) > Number(latest.taxYear) ? current : latest,
      );
    } catch (e: unknown) {
      this.logger.error(`Failed to parse valuation notice extraction: ${(e as Error).message}`);
      this.logger.error(`Raw Claude response (first 500 chars): ${result.text.slice(0, 500)}`);
      throw e;
    }
  }

  private isPdf(base64: string): boolean {
    try {
      const header = Buffer.from(base64.slice(0, 8), 'base64').toString('latin1');
      return header.startsWith(PDF_MAGIC_BYTES);
    } catch {
      return false;
    }
  }
}
