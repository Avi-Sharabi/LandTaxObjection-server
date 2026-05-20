import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class VgOutcomeNotificationTask {
  private readonly logger = new Logger(VgOutcomeNotificationTask.name);

  constructor(
    @InjectRepository(DisputeCase)
    private readonly repo: Repository<DisputeCase>,
    private readonly azureEmailService: AzureEmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Runs hourly — configurable via VG_OUTCOME_NOTIFICATION_CRON env var
  @Cron(process.env.VG_OUTCOME_NOTIFICATION_CRON ?? '0 * * * *')
  async runVgOutcomeNotificationCheck(): Promise<void> {
    this.logger.log('[VG-OUTCOME-NOTIFY] Starting check');

    let cases: DisputeCase[];
    try {
      cases = await this.repo.find({
        where: [
          { status: DisputeStatus.VG_APPROVED, vg_outcome_notified_at: IsNull() },
          { status: DisputeStatus.VG_DECLINED, vg_outcome_notified_at: IsNull() },
        ],
        relations: ['client', 'property', 'assigned_accountant', 'valuation_notice'],
      });
    } catch (err) {
      this.logger.error(
        `[VG-OUTCOME-NOTIFY] Failed to query cases — err=${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    this.logger.log(`[VG-OUTCOME-NOTIFY] ${cases.length} case(s) pending notification`);

    let sent = 0;
    let failed = 0;

    for (const disputeCase of cases) {
      try {
        if (!disputeCase.client?.email) {
          this.logger.warn(`[VG-OUTCOME-NOTIFY] No client email — caseId=${disputeCase.id}, skipping`);
          continue;
        }

        const resolvedAt = new Date().toLocaleString('en-AU', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'Australia/Sydney',
        });

        const rawAssessedValue =
          disputeCase.original_assessed_value ?? disputeCase.valuation_notice?.assessed_land_value;
        const assessedLandValue =
          rawAssessedValue != null
            ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
                Number(rawAssessedValue),
              )
            : 'N/A';

        await this.azureEmailService.sendVgResponseNotification({
          clientEmail: disputeCase.client.email,
          clientName: disputeCase.client.name,
          caseReference: disputeCase.case_reference,
          propertyAddress: this.buildPropertyAddress(disputeCase.property),
          lodgmentReferenceNumber: disputeCase.lodgment_reference_number ?? 'N/A',
          isApproved: disputeCase.status === DisputeStatus.VG_APPROVED,
          assessorFullName: disputeCase.assigned_accountant?.fullName ?? 'Your YML Adviser',
          resolvedAt,
          assessedLandValue,
        });

        if (disputeCase.assigned_accountant_id) {
          const label = disputeCase.status === DisputeStatus.VG_APPROVED ? 'approved' : 'declined';
          await this.notificationsService.create(
            disputeCase.assigned_accountant_id,
            NotificationType.VG_RESPONSE_RECEIVED,
            `VG response received for case ${disputeCase.case_reference} — outcome: ${label}.`,
            disputeCase.id,
          );
        }

        disputeCase.vg_outcome_notified_at = new Date();
        await this.repo.save(disputeCase);

        sent++;
        this.logger.log(`[VG-OUTCOME-NOTIFY] Notification sent — caseId=${disputeCase.id}`);
      } catch (err) {
        failed++;
        this.logger.error(
          `[VG-OUTCOME-NOTIFY] Failed — caseId=${disputeCase.id} err=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `[VG-OUTCOME-NOTIFY] Check complete — checked=${cases.length} sent=${sent} failed=${failed}`,
    );
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
