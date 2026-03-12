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

    private loadTemplate(templateName: string, variables: Record<string, string>): string {
        const filePath = path.join(__dirname, 'templates', `${templateName}.html`);
        let html = fs.readFileSync(filePath, 'utf-8');

        Object.entries(variables).forEach(([key, value]) => {
            html = html.replaceAll(`{{${key}}}`, value);
        });

        return html;
    }

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
}