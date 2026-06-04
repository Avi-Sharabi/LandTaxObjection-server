// src/common/azure-email/azure-email.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient, EmailMessage } from '@azure/communication-email';
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
    'vg-follow-up-enquiry',
    'vg-response-notification',
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
                    `\\{\\{#if ${key}\\}\\}([\\s\\S]*?)\\{\\{/if(?:\\s+${key})?\\}\\}`,
                    'g',
                );
                html = html.replace(ifRegex, value ? '$1' : '');
                html = html.replaceAll(`{{${key}}}`, value);
            }
        });

        return html;
    }

    private async send(message: EmailMessage): Promise<void> {
        const poller = await this.emailClient.beginSend(message);
        const result = await poller.pollUntilDone();
        if (result.status !== 'Succeeded') {
            throw new Error(`Azure ACS email delivery failed — status=${result.status} id=${result.id}`);
        }
    }

    async sendDisputeApplication(
        caseReferences: string[],
        sendTo: string,
        details?: { clientName?: string; assessorName?: string; propertyAddresses?: string[] },
    ): Promise<void> {
        const contactEmail = this.config.get<string>('CONTACT_EMAIL') ?? '';

        const html = this.loadTemplate('dispute-application-submitted', {
            caseReference:   caseReferences.join(', '),
            propertyAddress: (details?.propertyAddresses ?? []).join(', '),
            clientName:      details?.clientName ?? '',
            assessorName:    details?.assessorName ?? 'Assessment Team',
            contactEmail,
        });

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

        await this.send(message);
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
            clientName:           data.clientName,
            caseReference:        data.caseReference,
            propertyAddress:      data.propertyAddress,
            vgAssessedValue:      data.vgAssessedValue,
            internalAssessedValue: data.internalAssessedValue,
            assessorName:         data.assessorFullName,
            closedAt:             data.closedAt,
            contactEmail,
            viewReportUrl:        data.viewReportUrl ?? '',
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

        await this.send(message);
    }

    async sendObjectionPackageApproval(params: {
        sendTo: string;
        clientName: string;
        propertyAddress: string;
        taxYear: string;
        approvalLink: string;
        firmName: string;
        contactEmail: string;
        caseReference?: string;
        assessorName?: string;
        attachments?: EmailAttachment[];
    }): Promise<void> {
        const html = this.loadTemplate('objection-package-approval', {
            clientName:      params.clientName,
            propertyAddress: params.propertyAddress,
            taxYear:         params.taxYear,
            approvalLink:    params.approvalLink,
            firmName:        params.firmName,
            contactEmail:    params.contactEmail,
            caseReference:   params.caseReference ?? '',
            assessorName:    params.assessorName ?? '',
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: params.sendTo, displayName: params.clientName }],
            },
            content: {
                subject: `Objection Package Update \u2013 ${params.propertyAddress}`,
                html,
            },
            ...(params.attachments?.length && { attachments: params.attachments }),
        };

        await this.send(message);
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

        await this.send(message);
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

        await this.send(message);
    }

    async sendVgFollowUpEnquiry(params: {
        sendTo: string;
        recipientName?: string;
        caseReference: string;
        propertyAddress: string;
        lodgmentReferenceNumber: string;
        submittedAt: string;
        followUpCount: string;
    }): Promise<void> {
        const contactEmail = this.config.getOrThrow<string>('CONTACT_EMAIL');

        const html = this.loadTemplate('vg-follow-up-enquiry', {
            caseReference: params.caseReference,
            propertyAddress: params.propertyAddress,
            lodgmentReferenceNumber: params.lodgmentReferenceNumber,
            submittedAt: params.submittedAt,
            followUpCount: params.followUpCount,
            contactEmail,
        });

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: params.sendTo, displayName: params.recipientName ?? 'Valuer-General Office' }],
            },
            content: {
                subject: `[${params.caseReference}] Follow-Up Enquiry #${params.followUpCount} — Awaiting VG Response`,
                html,
            },
        };

        await this.send(message);
    }

    async sendVgResponseNotification(params: {
        clientEmail: string;
        clientName: string;
        caseReference: string;
        propertyAddress: string;
        lodgmentReferenceNumber: string;
        isApproved: boolean;
        assessorFullName: string;
        resolvedAt: string;
        assessedLandValue: string;
    }): Promise<void> {
        const contactEmail = this.config.getOrThrow<string>('CONTACT_EMAIL');

        const html = this.loadTemplate('vg-response-notification', {
            clientName: params.clientName,
            caseReference: params.caseReference,
            propertyAddress: params.propertyAddress,
            lodgmentReferenceNumber: params.lodgmentReferenceNumber,
            isApproved: params.isApproved ? '1' : '',
            isDeclined: params.isApproved ? '' : '1',
            outcomeLabel: params.isApproved ? 'Approved' : 'Declined',
            assessorFullName: params.assessorFullName,
            resolvedAt: params.resolvedAt,
            assessedLandValue: params.assessedLandValue,
            contactEmail,
        });

        const outcomeText = params.isApproved ? 'Approved' : 'Declined';

        const message = {
            senderAddress: this.sender,
            recipients: {
                to: [{ address: params.clientEmail, displayName: params.clientName }],
            },
            content: {
                subject: `[${params.caseReference}] VG Response Received – Objection ${outcomeText}`,
                html,
            },
        };

        await this.send(message);
    }
}
