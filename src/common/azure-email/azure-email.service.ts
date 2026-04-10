// src/common/azure-email/azure-email.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';
import * as fs from 'fs';
import * as path from 'path';

interface EmailAttachment {
    name: string;
    contentType: string;
    contentInBase64: string;
}

const TEMPLATE_NAMES = [
    'dispute-application-submitted',
    'advisory-letter-notification',
    'objection-package-approval',
    'objection-package-reminder',
    'vg-submission-confirmation',
] as const;

type TemplateName = (typeof TEMPLATE_NAMES)[number];

@Injectable()
export class AzureEmailService implements OnModuleInit {
    private readonly emailClient: EmailClient;
    private readonly sender: string;
    private readonly templateCache = new Map<TemplateName, string>();

    constructor(private readonly config: ConfigService) {
        this.emailClient = new EmailClient(
            this.config.get('AZURE_COMMUNICATION_CONNECTION_STRING') || "",
        );
        this.sender = this.config.get('AZURE_COMMUNICATION_SENDER') || "";
    }

    onModuleInit(): void {
        for (const name of TEMPLATE_NAMES) {
            const filePath = path.join(__dirname, 'templates', `${name}.html`);
            this.templateCache.set(name, fs.readFileSync(filePath, 'utf-8'));
        }
    }

    private loadTemplate(templateName: TemplateName, variables: Record<string, string | string[]>): string {
        let html = this.templateCache.get(templateName)!;

        Object.entries(variables).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                const blockRegex = new RegExp(
                    `\\{\\{#each ${key}\\}\\}([\\s\\S]*?)\\{\\{/each\\}\\}`,
                    'g',
                );
                html = html.replace(blockRegex, (_match, body: string) =>
                    value.map((item) => body.replaceAll('{{this}}', item)).join(''),
                );
            } else {
                // Render {{#if key}}...{{/if}} blocks: include content when value is truthy, omit when falsy.
                const ifRegex = new RegExp(
                    `\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`,
                    'g',
                );
                html = html.replace(ifRegex, value ? '$1' : '');
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
        attachments?: EmailAttachment[];
        closedAt: string;
        viewReportUrl?: string;
    }): Promise<void> {
        const contactEmail = this.config.getOrThrow<string>('CONTACT_EMAIL');

        const html = this.loadTemplate('advisory-letter-notification', {
            caseReference: data.caseReference,
            propertyAddress: data.propertyAddress,
            vgAssessedValue: data.vgAssessedValue,
            internalAssessedValue: data.internalAssessedValue,
            assessorFullName: data.assessorFullName,
            closedAt: data.closedAt,
            contactEmail,
            viewReportUrl: data.viewReportUrl ?? '',
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
            ...(data.attachments?.length && { attachments: data.attachments }),
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }

    async sendObjectionPackageApproval(params: {
        sendTo: string;
        clientName: string;
        propertyAddress: string;
        taxYear: string;
        approvalLink: string;
        firmName: string;
        contactEmail: string;
        attachments?: EmailAttachment[];
    }): Promise<void> {
        const html = this.loadTemplate('objection-package-approval', {
            client_name: params.clientName,
            property_address: params.propertyAddress,
            tax_year: params.taxYear,
            approval_link: params.approvalLink,
            firm_name: params.firmName,
            contact_email: params.contactEmail,
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: params.sendTo, displayName: params.clientName }],
            },
            content: {
                subject: 'Action Required \u2013 Please Review and Approve Your Objection Package',
                html,
            },
            ...(params.attachments?.length && { attachments: params.attachments }),
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }

    async sendObjectionPackageReminder(params: {
        sendTo: string;
        clientName: string;
        propertyAddress: string;
        taxYear: string;
        approvalLink: string;
        firmName: string;
        contactEmail: string;
        attachments?: EmailAttachment[];
    }): Promise<void> {
        const html = this.loadTemplate('objection-package-reminder', {
            client_name: params.clientName,
            property_address: params.propertyAddress,
            tax_year: params.taxYear,
            approval_link: params.approvalLink,
            firm_name: params.firmName,
            contact_email: params.contactEmail,
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: params.sendTo, displayName: params.clientName }],
            },
            content: {
                subject: 'Reminder \u2013 Your Objection Package Awaits Approval',
                html,
            },
            ...(params.attachments?.length && { attachments: params.attachments }),
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }

    async sendVgSubmissionConfirmation(params: {
        sendTo: string;
        clientName: string;
        caseReference: string;
        propertyAddress: string;
        lodgmentReferenceNumber: string;
        submittedAt: string;
        assessorFullName: string;
    }): Promise<void> {
        const contactEmail = this.config.getOrThrow<string>('CONTACT_EMAIL');

        const html = this.loadTemplate('vg-submission-confirmation', {
            caseReference: params.caseReference,
            propertyAddress: params.propertyAddress,
            lodgmentReferenceNumber: params.lodgmentReferenceNumber,
            submittedAt: params.submittedAt,
            assessorFullName: params.assessorFullName,
            contactEmail,
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: params.sendTo, displayName: params.clientName }],
            },
            content: {
                subject: `[${params.caseReference}] Objection Package Submitted to Valuer-General`,
                html,
            },
        };

        const poller = await this.emailClient.beginSend(message);
        await poller.pollUntilDone();
    }
}
