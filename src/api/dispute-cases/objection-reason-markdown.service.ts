import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { NavigationSkillUnavailableException } from './exceptions/navigation-skill-unavailable.exception';
import { DisputeCase } from './entities/dispute-case.entity';
import { Property } from '../properties/entities/property.entity';

export interface NavigationSource {
  name: string;
  url: string;
  grounds: string[];
  purpose: string;
  steps: string[];
  learnedSteps: string[];
  expectedOutput: string;
  screenshotBase: string;
  difficultyLog: string;
}

export interface NavigationGuide {
  sourcesMap: Map<string, NavigationSource>;
  priorityOrder: string[];
}

@Injectable()
export class ObjectionReasonMarkdownService {
  private readonly logger = new Logger(ObjectionReasonMarkdownService.name);

  async buildGuide(disputeCase: DisputeCase & { property: Property; client: { name: string } | null }): Promise<NavigationGuide> {
    const placeholders = this.buildPlaceholders(disputeCase);

    const skillDir = join(__dirname, '..', '..', 'skills');
    let navRaw: string;
    let linksRaw: string;
    try {
      [navRaw, linksRaw] = await Promise.all([
        readFile(join(skillDir, 'objection-reason-navigation.md'), 'utf8'),
        readFile(join(skillDir, 'objection-reason-links.md'), 'utf8'),
      ]);
    } catch (err: unknown) {
      this.logger.error(`Failed to load objection-reason skill files: ${(err as Error).message}`);
      throw new NavigationSkillUnavailableException();
    }

    const injectedNav = this.fillPlaceholders(navRaw, placeholders);
    const injectedLinks = this.fillPlaceholders(linksRaw, placeholders);

    const sourcesMap = this.parseNavigationGuide(injectedNav);
    const { priorityOrder } = this.parseLinksByIssue(injectedLinks);

    return { sourcesMap, priorityOrder };
  }

  private buildPlaceholders(disputeCase: DisputeCase & { property: Property; client: { name: string } | null }): Record<string, string> {
    const prop = disputeCase.property;
    const address = [prop.address, prop.suburb, prop.state, prop.postcode].filter(Boolean).join(' ');

    let lot = '';
    let dp = '';
    if (prop.lot_dp) {
      const match = prop.lot_dp.match(/Lot\s+(\S+)\s+(?:DP|SP|CP)\s+(\S+)/i);
      if (match) { lot = match[1]; dp = match[2]; }
    }

    const clientName = disputeCase.client?.name ?? '';

    return {
      PID: prop.pid ?? '',
      ADDRESS: address,
      TRUSTEE_NAME: clientName,
      TRUST_NAME: clientName,
      LOT: lot,
      DP: dp,
      ENTITY_SEARCH: clientName.replace(/\s+(PTY|LTD|ATF|UNIT TRUST|TRUST|PTE)\b.*/i, '').trim(),
      AREA_ON_NOTICE: '',
      ZONE_ON_NOTICE: '',
      LOT_DP_ON_NOTICE: '',
    };
  }

  fillPlaceholders(text: string, env: Record<string, string>): string {
    return text
      .replace(/\[PID\]/g, env.PID ?? '')
      .replace(/\[ADDRESS\]/g, env.ADDRESS ?? '')
      .replace(/\[TRUSTEE_NAME\]/g, env.TRUSTEE_NAME ?? '')
      .replace(/\[TRUST_NAME\]/g, env.TRUST_NAME ?? '')
      .replace(/\[LOT\]/g, env.LOT ?? '')
      .replace(/\[DP\]/g, env.DP ?? '')
      .replace(/\[ENTITY_SEARCH\]/g, env.ENTITY_SEARCH ?? '')
      .replace(/\[AREA_ON_NOTICE\]/g, env.AREA_ON_NOTICE ?? '')
      .replace(/\[ZONE_ON_NOTICE\]/g, env.ZONE_ON_NOTICE ?? '')
      .replace(/\[LOT_DP_ON_NOTICE\]/g, env.LOT_DP_ON_NOTICE ?? '');
  }

  parseNavigationGuide(content: string): Map<string, NavigationSource> {
    const sources = new Map<string, NavigationSource>();
    const blocks = content.split(/^## /m).slice(1);

    for (const block of blocks) {
      const lines = block.split('\n');
      const name = lines[0].trim();

      const urlLine = lines.find(l => l.startsWith('**URL:**'));
      if (!urlLine) continue;

      const url = urlLine.replace('**URL:**', '').trim();

      const groundLine = lines.find(l => l.startsWith('**Ground:**'));
      const grounds = groundLine
        ? groundLine.replace('**Ground:**', '').trim().split(/[,\s]+/).filter(Boolean)
        : [];

      const purposeLine = lines.find(l => l.startsWith('**Purpose:**'));
      const purpose = purposeLine ? purposeLine.replace('**Purpose:**', '').trim() : '';

      const stepsSection = this.extractSection(block, '### Steps');
      const steps: string[] = [];
      let currentStep: string | null = null;
      for (const line of stepsSection.split('\n')) {
        const trimmed = line.trim();
        if (/^\d+\./.test(trimmed)) {
          if (currentStep !== null) steps.push(currentStep);
          currentStep = trimmed;
        } else if (currentStep !== null && trimmed.startsWith('→')) {
          currentStep += ' ' + trimmed;
        }
      }
      if (currentStep !== null) steps.push(currentStep);

      const learnedSection = this.extractSection(block, '### Learned steps');
      const learnedSteps = learnedSection
        .split('\n')
        .filter(l => /^\d+\./.test(l.trim()))
        .map(l => l.trim());

      const outputSection = this.extractSection(block, '### Expected output');
      const expectedOutput = outputSection.trim();

      const screenshotMatch = stepsSection.match(/save as ([a-z0-9-]+)-\[date\]\.png/i);
      const screenshotBase = screenshotMatch
        ? screenshotMatch[1]
        : name.toLowerCase().replace(/\s+/g, '-');

      const difficultySection = this.extractSection(block, '### Difficulty log');

      sources.set(name, {
        name,
        url,
        grounds,
        purpose,
        steps,
        learnedSteps,
        expectedOutput,
        screenshotBase,
        difficultyLog: difficultySection.trim(),
      });
    }

    return sources;
  }

  parseLinksByIssue(content: string): { priorityOrder: string[] } {
    const stripped = content.replace(/<!--[\s\S]*?-->/g, '');

    const priorityMatch = stripped.match(/## Priority Order[\s\S]*?(?=\n## |\n---\n|$)/);
    const prioritySection = priorityMatch ? priorityMatch[0] : '';

    const automatedMatch = prioritySection.match(/1\.\s+\*\*Run automated[\s\S]*?(?=\n\d+\.\s|\s*$)/);
    const automatedSection = automatedMatch ? automatedMatch[0] : prioritySection;

    const priorityOrder = automatedSection
      .split('\n')
      .filter(l => /^\s+- /.test(l))
      .map(l => {
        const text = l.replace(/^\s+- /, '').trim();
        return text.split(/\s+→\s+/)[0].trim();
      })
      .filter(Boolean);

    return { priorityOrder };
  }

  fuzzyMatch(priorityName: string, sourceNames: string[]): string | null {
    const needle = priorityName.toLowerCase().split(/\s+/);
    let bestScore = -1;
    let bestMatch: string | null = null;

    for (const name of sourceNames) {
      const haystack = name.toLowerCase().split(/\s+/);
      const score = needle.filter(w => haystack.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = name;
      }
    }

    return bestScore > 0 ? bestMatch : null;
  }

  private extractSection(block: string, heading: string): string {
    const start = block.indexOf(heading);
    if (start === -1) return '';
    const afterHeading = block.slice(start + heading.length);
    const nextSection = afterHeading.search(/\n###\s/);
    return nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);
  }
}
