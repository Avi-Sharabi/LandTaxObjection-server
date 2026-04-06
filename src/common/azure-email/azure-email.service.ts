// src/common/azure-email/azure-email.service.ts

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
            this.config.get('AZURE_COMMUNICATION_CONNECTION_STRING') || "",
        );
        this.sender = this.config.get('AZURE_COMMUNICATION_SENDER') || "";
    }

    private loadTemplate(templateName: string, variables: Record<string, string | string[]>): string {
        const filePath = path.join(__dirname, 'templates', `${templateName}.html`);
        let html = fs.readFileSync(filePath, 'utf-8');

        Object.entries(variables).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                // Replace {{#each key}}...body...{{/each}} blocks
                const blockRegex = new RegExp(
                    `\\{\\{#each ${key}\\}\\}([\\s\\S]*?)\\{\\{/each\\}\\}`,
                    'g',
                );
                html = html.replace(blockRegex, (_match, body: string) =>
                    value.map((item) => body.replaceAll('{{this}}', item)).join(''),
                );
            } else {
                html = html.replaceAll(`{{${key}}}`, value);
            }
        });

        return html;
    }

    async sendDisputeApplication(caseReferences: string[], sendTo: string): Promise<void> {
        const html = this.loadTemplate('dispute-application-submitted', { caseReferences });

        const subjectLabel = caseReferences.length === 1
            ? `[${caseReferences[0]}]`
            : `[${caseReferences.length} Cases]`;

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: sendTo, displayName: 'Land Tax Dispute Team' }],
            },
            content: {
                subject: `${subjectLabel} New Land Tax Dispute Intake`,
                html,
            },
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }

    async sendAdvisoryLetterNotification(data: {
        clientName: string;
        clientEmail: string;
        caseReference: string;
        propertyAddress: string;
        vgAssessedValue: string;
        internalAssessedValue: string;
        assessorFullName: string;
        analysisReportUrl: string;
        analysisPdfBase64: string;
        closedAt: string;
    }): Promise<void> {
        const contactEmail = this.config.get('CONTACT_EMAIL') || '';

        const html = this.loadTemplate('advisory-letter-notification', {
            caseReference: data.caseReference,
            propertyAddress: data.propertyAddress,
            vgAssessedValue: data.vgAssessedValue,
            internalAssessedValue: data.internalAssessedValue,
            assessorFullName: data.assessorFullName,
            analysisReportUrl: data.analysisReportUrl,
            closedAt: data.closedAt,
            contactEmail,
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: data.clientEmail, displayName: data.clientName }],
            },
            content: {
                subject: `[${data.caseReference}] Your Land Tax Dispute Case Has Been Closed`,
                html,
            },
            attachments: [
                {
                    name: `valuation-analysis-${data.caseReference}.pdf`,
                    contentType: 'application/pdf',
                    contentInBase64: data.analysisPdfBase64,
                },
            ],
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }
}
