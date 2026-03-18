// src/common/azure-email/azure-email.service.ts
//
// CHANGES from original:
//   + Added sendConstraintDocumentRequest() for KAN-8 missing-doc emails
//   + Added constraint-document-request.html template (see below)
//   Everything else is unchanged.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AzureEmailService {
  private readonly emailClient: EmailClient;
  private readonly sender: string;

  constructor(private readonly config: ConfigService) {
    this.emailClient = new EmailClient(
      this.config.get('AZURE_COMMUNICATION_CONNECTION_STRING') || '',
    );
    this.sender = this.config.get('AZURE_COMMUNICATION_SENDER') || '';
  }

  private loadTemplate(templateName: string, variables: Record<string, string>): string {
    const filePath = path.join(__dirname, 'templates', `${templateName}.html`);
    let html = fs.readFileSync(filePath, 'utf-8');
    Object.entries(variables).forEach(([key, value]) => {
      html = html.replaceAll(`{{${key}}}`, value);
    });
    return html;
  }

  // ── EXISTING (unchanged) ──────────────────────────────────────────────────

  async sendDisputeApplication(caseReference: string, sendTo: string): Promise<void> {
    const html = this.loadTemplate('dispute-application-submitted', { caseReference });

    const message = {
      senderAddress: this.sender,
      recipients: {
        to: [{ address: sendTo, displayName: 'Land Tax Dispute Team' }],
      },
      content: {
        subject: `[${caseReference}] New Land Tax Dispute Intake`,
        html,
      },
    };

    const poller = await this.emailClient.beginSend(message);
    await poller.pollUntilDone();
  }

  // ── NEW: KAN-8 ────────────────────────────────────────────────────────────

  /**
   * Sends a missing-document request email to the client for a specific
   * site constraint. Uses the `constraint-document-request.html` template.
   *
   * @param caseReference  - Dispute case reference (e.g. "YML-2026-0042")
   * @param constraintLabel - Human-readable constraint name (e.g. "100-Year Flood Zone")
   * @param requiredDocTypes - List of document_type values the client needs to upload
   * @param sendTo          - Client email address
   */
  async sendConstraintDocumentRequest(
    caseReference: string,
    constraintLabel: string,
    requiredDocTypes: string[],
    sendTo: string,
  ): Promise<void> {
    const docList = requiredDocTypes
      .map((d) => `<li>${this.formatDocType(d)}</li>`)
      .join('');

    const html = this.loadTemplate('constraint-document-request', {
      caseReference,
      constraintLabel,
      docList,
    });

    const message = {
      senderAddress: this.sender,
      recipients: {
        to: [{ address: sendTo, displayName: 'Land Tax Dispute Client' }],
      },
      content: {
        subject: `[${caseReference}] Action Required – Documents Needed for ${constraintLabel}`,
        html,
      },
    };

    const poller = await this.emailClient.beginSend(message);
    await poller.pollUntilDone();
  }

  private formatDocType(docType: string): string {
    return docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}