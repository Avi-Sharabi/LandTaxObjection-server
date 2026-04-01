import { Injectable } from '@nestjs/common';
import { DisputeStatus } from '../dispute-cases/entities/dispute-case.entity';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { PackageDocumentStatus } from './entities/package-document.entity';
import { PackageDocumentDto } from './dto/package-document.dto';
import { DocumentsResponseDto, PackageStatus } from './dto/documents-response.dto';
import { ObjectionPackageNotReadyException } from './exceptions/objection-package-not-ready.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { ObjectionPackageRepository } from './objection-package.repository';

// Must match the DisputeStatus lifecycle order exactly
const STATUS_ORDER: DisputeStatus[] = [
  DisputeStatus.DRAFT,
  DisputeStatus.GROUNDS_SELECTION,
  DisputeStatus.EVIDENCE_COMPILATION,
  DisputeStatus.APPRAISAL,
  DisputeStatus.ADVISORY_LETTER_ISSUED,
  DisputeStatus.OBJECTION_PACKAGE_PREPARED,
  DisputeStatus.AWAITING_CLIENT_APPROVAL,
  DisputeStatus.SUBMITTED_TO_VG,
  DisputeStatus.AWAITING_VG_RESPONSE,
  DisputeStatus.OUTCOME_RECEIVED,
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];

const SIGNED_URL_EXPIRY_MINUTES = 30;

@Injectable()
export class ObjectionPackageService {
  constructor(
    private readonly objectionPackageRepository: ObjectionPackageRepository,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async getDocuments(disputeCaseId: string): Promise<DocumentsResponseDto> {
    const disputeCase = await this.assertCaseIsReady(disputeCaseId);
    const docs = await this.objectionPackageRepository.findDocumentsByCaseId(disputeCaseId);

    const documents = docs.map((doc) => {
      const isReady = doc.status === PackageDocumentStatus.READY && doc.blob_name !== null;
      const viewUrl = isReady
        ? this.azureBlobService.getFileUrl(doc.blob_name, SIGNED_URL_EXPIRY_MINUTES)
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
      packageStatus: this.derivePackageStatus(disputeCase.status),
      documents,
    };
  }

  private async assertCaseIsReady(disputeCaseId: string) {
    const disputeCase = await this.objectionPackageRepository.findDisputeCase(disputeCaseId);
    if (!disputeCase) {
      throw new DisputeCaseNotFoundException(disputeCaseId);
    }
    const caseIndex = STATUS_ORDER.indexOf(disputeCase.status);
    const threshold = STATUS_ORDER.indexOf(DisputeStatus.OBJECTION_PACKAGE_PREPARED);
    if (caseIndex < threshold) {
      throw new ObjectionPackageNotReadyException();
    }
    return disputeCase;
  }

  private derivePackageStatus(status: DisputeStatus): PackageStatus {
    const idx = STATUS_ORDER.indexOf(status);
    const submittedIdx = STATUS_ORDER.indexOf(DisputeStatus.SUBMITTED_TO_VG);
    if (idx >= submittedIdx) {
      return PackageStatus.SENT_TO_CLIENT;
    }
    if (status === DisputeStatus.AWAITING_CLIENT_APPROVAL) {
      return PackageStatus.APPROVED;
    }
    return PackageStatus.PENDING_INTERNAL_REVIEW;
  }
}
