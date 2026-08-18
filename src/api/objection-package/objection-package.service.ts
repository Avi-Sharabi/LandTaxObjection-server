import { Injectable } from '@nestjs/common';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { isAtOrAfterAnalysis } from '../dispute-cases/dispute-status';
import { DecisionOutcome } from '../valuation-notices/entities/valuation-notice.entity';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { PackageDocumentStatus } from './entities/package-document.entity';
import { PackageDocumentDto } from './dto/package-document.dto';
import {
  DocumentsResponseDto,
  PackageStatus,
} from './dto/documents-response.dto';
import { ObjectionPackageNotReadyException } from './exceptions/objection-package-not-ready.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { ObjectionPackageRepository } from './objection-package.repository';

const SIGNED_URL_EXPIRY_MINUTES = 30;

@Injectable()
export class ObjectionPackageService {
  constructor(
    private readonly objectionPackageRepository: ObjectionPackageRepository,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async getDocuments(disputeCaseId: string): Promise<DocumentsResponseDto> {
    const disputeCase = await this.assertCaseIsReady(disputeCaseId);
    const docs =
      await this.objectionPackageRepository.findDocumentsByCaseId(
        disputeCaseId,
      );

    const documents = docs.map((doc) => {
      const isReady =
        doc.status === PackageDocumentStatus.READY && doc.blob_name !== null;
      const viewUrl = isReady
        ? this.azureBlobService.getFileUrl(
            doc.blob_name,
            SIGNED_URL_EXPIRY_MINUTES,
          )
        : null;
      const downloadUrl = isReady
        ? this.azureBlobService.getFileUrl(
            doc.blob_name,
            SIGNED_URL_EXPIRY_MINUTES,
            `attachment; filename="${doc.name}.pdf"`,
          )
        : null;
      return PackageDocumentDto.fromEntity(doc, viewUrl, downloadUrl);
    });

    return {
      packageStatus: this.derivePackageStatus(disputeCase),
      documents,
    };
  }

  private async assertCaseIsReady(disputeCaseId: string) {
    const disputeCase =
      await this.objectionPackageRepository.findDisputeCase(disputeCaseId);
    if (!disputeCase) {
      throw new DisputeCaseNotFoundException(disputeCaseId);
    }
    if (!isAtOrAfterAnalysis(disputeCase.status)) {
      throw new ObjectionPackageNotReadyException();
    }
    // Tested positively for OBJECTION, not negatively for ADVISORY: a case whose appraisal has not
    // been submitted has decision_outcome = null, and an ADVISORY case can reach objection_submitted
    // (onObjectionSubmitted gates on submitted_at only, never on decision_outcome).
    // Both must be rejected. Requires valuation_notice to be loaded — see ObjectionPackageRepository.
    if (
      disputeCase.valuation_notice?.decision_outcome !==
      DecisionOutcome.OBJECTION
    ) {
      throw new ObjectionPackageNotReadyException();
    }
    return disputeCase;
  }

  private derivePackageStatus(disputeCase: DisputeCase): PackageStatus {
    // submitted_at, not isAtOrAfterLodgement: that set includes case_closed because case_closed is
    // REACHABLE from lodged statuses, not because a closed case was lodged. An advisory close
    // never lodged anything, and reporting its package as SENT_TO_CLIENT is simply false.
    if (disputeCase.submitted_at !== null) {
      return PackageStatus.SENT_TO_CLIENT;
    }
    // PackageStatus.APPROVED is deliberately left in the enum but is no longer reachable: it was
    // produced only while the client-approval feature existed, and the frontend badge still
    // accepts the value. Nothing else replaces it — a package is either lodged or awaiting
    // internal review.
    return PackageStatus.PENDING_INTERNAL_REVIEW;
  }
}
