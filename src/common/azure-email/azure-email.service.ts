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
        advisoryLetterUrl: string;
    }): Promise<void> {
        const notifyEmail = this.config.get('ADVISORY_LETTER_NOTIFY_EMAIL') || 'arvin.bermudez@ymlgroup.com.au';

        const html = this.loadTemplate('advisory-letter-notification', {
            caseReference: data.caseReference,
            clientName: data.clientName,
            clientEmail: data.clientEmail,
            propertyAddress: data.propertyAddress,
            vgAssessedValue: data.vgAssessedValue,
            internalAssessedValue: data.internalAssessedValue,
            assessorFullName: data.assessorFullName,
            advisoryLetterUrl: data.advisoryLetterUrl,
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: notifyEmail, displayName: 'Avi Sharabi' }],
            },
            content: {
                subject: `[${data.caseReference}] Advisory Letter Ready — Action Required`,
                html,
            },
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }
}
