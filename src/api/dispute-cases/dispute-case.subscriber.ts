import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, EventSubscriber, UpdateEvent } from 'typeorm';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

const VG_FINAL_STATUSES = [DisputeStatus.VG_APPROVED, DisputeStatus.VG_DECLINED] as const;
type VgFinalStatus = (typeof VG_FINAL_STATUSES)[number];

@Injectable()
@EventSubscriber()
export class DisputeCaseSubscriber implements EntitySubscriberInterface<DisputeCase> {
  private readonly logger = new Logger(DisputeCaseSubscriber.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly azureEmailService: AzureEmailService,
    private readonly notificationsService: NotificationsService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return DisputeCase;
  }

  async afterUpdate(event: UpdateEvent<DisputeCase>): Promise<void> {
    const newStatus = event.entity?.status as DisputeStatus | undefined;
    const oldStatus = event.databaseEntity?.status as DisputeStatus | undefined;

    if (!this.isVgFinalOutcome(newStatus) || newStatus === oldStatus) return;

    const caseId = event.entity?.id ?? event.databaseEntity?.id;
    if (!caseId) return;

    try {
      const fullCase = await event.manager.findOne(DisputeCase, {
        where: { id: caseId },
        relations: ['client', 'property', 'assigned_accountant', 'valuation_notice'],
      });

      if (!fullCase) return;

      const resolvedAtStr = new Date().toLocaleString('en-AU', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const rawAssessedValue = fullCase.original_assessed_value ?? fullCase.valuation_notice?.assessed_land_value;
      const assessedLandValue = rawAssessedValue != null
        ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(rawAssessedValue))
        : 'N/A';

      if (fullCase.client?.email) {
        this.azureEmailService
          .sendVgResponseNotification({
            clientEmail: fullCase.client.email,
            clientName: fullCase.client.name,
            caseReference: fullCase.case_reference,
            propertyAddress: this.buildPropertyAddress(fullCase.property),
            lodgmentReferenceNumber: fullCase.lodgment_reference_number ?? 'N/A',
            isApproved: newStatus === DisputeStatus.VG_APPROVED,
            assessorFullName: fullCase.assigned_accountant?.fullName ?? 'Your YML Adviser',
            resolvedAt: resolvedAtStr,
            assessedLandValue,
          })
          .catch((err) => this.logger.error('[VG-SUBSCRIBER] Email send failed', err));
      }

      if (fullCase.assigned_accountant_id) {
        const label = newStatus === DisputeStatus.VG_APPROVED ? 'approved' : 'declined';
        await this.notificationsService.create(
          fullCase.assigned_accountant_id,
          NotificationType.VG_FOLLOW_UP_SENT,
          `VG response received for case ${fullCase.case_reference} — outcome: ${label}.`,
          caseId,
        );
      }
    } catch (err) {
      this.logger.error(`[VG-SUBSCRIBER] Failed to process VG outcome for case ${caseId}`, err);
    }
  }

  private isVgFinalOutcome(status: DisputeStatus | undefined): status is VgFinalStatus {
    return VG_FINAL_STATUSES.includes(status as VgFinalStatus);
  }

  private buildPropertyAddress(
    property: { address: string | null; suburb: string | null; state: string | null; postcode: string | null } | null,
  ): string {
    if (!property) return 'Address not available';
    return [property.address, property.suburb, property.state, property.postcode]
      .filter(Boolean)
      .join(', ');
  }
}
