import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { DisputeCaseResponseDto } from './dto/dispute-case-response.dto';
import { AnalysisReportResponseDto } from './dto/analysis-report-response.dto';
import { ApprovalDocumentsResponseDto } from './dto/approval-documents-response.dto';
import { DisputeCase, DisputeStatus } from './entities/dispute-case.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { ComparablesService } from '../comparables/comparables.service';
import { AzureEmailService } from 'src/common/azure-email/azure-email.service';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { PackageDocument, PackageDocumentStatus } from '../objection-package/entities/package-document.entity';
import { ClientEmailMissingException } from './exceptions/client-email-missing.exception';

const ADVISORY_REPORT_LINK_EXPIRY_MINUTES = 3 * 24 * 60; // 3-day signed URL for advisory report
const REPORT_LINK_EXPIRY_MINUTES = 60;                    // 60-minute signed URL for accountant report view
const APPROVAL_TOKEN_EXPIRY_DAYS = 3;                     // 3-day client approval window
const DOCUMENT_VIEW_URL_EXPIRY_MINUTES = 30;              // short-lived signed URL for approval docs

const CLOSED_STATUSES: DisputeStatus[] = [
  DisputeStatus.CLOSED,
  DisputeStatus.CLOSED_NO_OBJECTION,
];

const ADVISORY_TOKEN_TTL_HOURS = 3 * 24; // 3-day advisory view token

@Injectable()
export class DisputeCasesService {
  private readonly logger = new Logger(DisputeCasesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    private readonly comparablesService: ComparablesService,
    private readonly azureEmailService: AzureEmailService,
    private readonly azureBlobService: AzureBlobService,
    private readonly config: ConfigService,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
    @InjectRepository(PackageDocument)
    private readonly packageDocumentRepo: Repository<PackageDocument>,
  ) { }

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto): Promise<unknown> {
    return this.intakeOrchestrator.submitIntakeApplication(intakeDto);
  }

  async findAll(): Promise<DisputeCaseResponseDto[]> {
    return await this.disputeCasesRepository.find()
  }

  async findOne(id: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds', 'dispute_constraints'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    return disputeCase;
  }

  async update(id: string, updateDisputeCaseDto: UpdateDisputeCaseDto): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    Object.assign(disputeCase, updateDisputeCaseDto);
    return await this.disputeCasesRepository.save(disputeCase);
  }

  async advanceToAppraisal(id: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    await this.comparablesService.assertMinimumComparables(id);
    disputeCase.status = DisputeStatus.APPRAISAL;
    return await this.disputeCasesRepository.save(disputeCase);
  }

  async closeNoObjection(caseId: string, dto: CloseNoObjectionDto): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: [
        'client',
        'property',
        'valuation_notice',
        'assigned_accountant',
      ],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (CLOSED_STATUSES.includes(disputeCase.status)) {
      throw new ConflictException(`Dispute case #${caseId} is already closed`);
    }

    const vgAssessedValue = Number(disputeCase.valuation_notice?.assessed_land_value ?? 0);

    if (dto.internalAssessmentValue < vgAssessedValue) {
      throw new ConflictException(
        `Internal assessment value ($${dto.internalAssessmentValue.toLocaleString()}) is less than the VG assessed value ` +
        `($${vgAssessedValue.toLocaleString()}). The case has viable objection grounds and should not be closed without objection.`,
      );
    }

    const closedAtDate = new Date();

    // Guard: client must have an email before we commit anything
    if (!disputeCase.client.email) {
      throw new ClientEmailMissingException(disputeCase.case_reference);
    }

    const advisoryToken = randomUUID();
    const advisoryTokenExpires = new Date(
      closedAtDate.getTime() + ADVISORY_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const viewReportUrl = `${frontendUrl}/advisory-view?token=${advisoryToken}`;

    // Persist status transition first — email is sent after a successful save.
    // If the email subsequently fails, the case is already correctly closed in
    // the DB and the advisory email can be re-triggered manually.
    disputeCase.status = DisputeStatus.CLOSED_NO_OBJECTION;
    disputeCase.closed_at = closedAtDate;
    disputeCase.advisory_view_token = advisoryToken;
    disputeCase.advisory_view_token_expires_at = advisoryTokenExpires;
    if (dto.assessorNotes !== undefined) {
      disputeCase.notes = dto.assessorNotes;
    }

    const saved = await this.disputeCasesRepository.save(disputeCase);

    this.azureEmailService
      .sendAdvisoryLetterNotification(
        this.buildAdvisoryEmailPayload(disputeCase, dto, vgAssessedValue, closedAtDate, viewReportUrl),
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Advisory letter email failed for case ${disputeCase.case_reference}: ${String(err)}`,
        );
      });

    return saved;
  }

  async sendObjectionPackage(caseId: string): Promise<DisputeCaseResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id: caseId },
      relations: ['client', 'property', 'valuation_notice'],
    });

    if (!disputeCase) {
      throw new NotFoundException(`Dispute case #${caseId} not found`);
    }

    if (disputeCase.client_approved_at !== null) {
      throw new ConflictException(`Dispute case #${caseId} has already been approved by the client`);
    }

    const token = randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const approvalLink = `${frontendUrl}/approve-package?token=${token}`;
    const clientName = disputeCase.client.name;
    const propertyAddress = this.buildPropertyAddress(disputeCase.property);
    const taxYear = String(new Date(disputeCase.valuation_notice.valuation_date).getFullYear());

    // Send email first — only persist state if the send succeeds.
    await this.azureEmailService.sendObjectionPackageApproval({
      sendTo: disputeCase.client.email ?? '',
      clientName,
      propertyAddress,
      taxYear,
      approvalLink,
      firmName: this.config.get<string>('FIRM_NAME') ?? 'Your Firm',
      contactEmail: this.config.get<string>('CONTACT_EMAIL') ?? '',
    });

    disputeCase.client_approval_token = token;
    disputeCase.client_approval_token_expires_at = expires;
    disputeCase.status = DisputeStatus.AWAITING_CLIENT_APPROVAL;
    disputeCase.client_approval_requested_at = new Date();

    return await this.disputeCasesRepository.save(disputeCase);
  }

  async approveObjectionPackage(token: string): Promise<{ alreadyApproved: boolean; propertyAddress?: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock only the dispute_cases row — no JOINs, as PostgreSQL rejects
      // FOR UPDATE on the nullable side of a LEFT JOIN.
      const disputeCase = await queryRunner.manager.findOne(DisputeCase, {
        where: { client_approval_token: token },
        lock: { mode: 'pessimistic_write' },
      });

      if (!disputeCase) {
        throw new NotFoundException('Approval token is invalid or does not exist');
      }

      if (disputeCase.client_approved_at !== null) {
        await queryRunner.commitTransaction();
        return { alreadyApproved: true };
      }

      if (DisputeCasesService.isExpired(disputeCase.client_approval_token_expires_at)) {
        throw new GoneException('Approval token has expired — please request a new package from your adviser');
      }

      disputeCase.client_approved_at = new Date();
      disputeCase.client_approval_token = null;
      disputeCase.client_approval_token_expires_at = null;
      disputeCase.status = DisputeStatus.CLIENT_APPROVED;

      await queryRunner.manager.save(disputeCase);
      await queryRunner.commitTransaction();

      // Fetch property address after commit — outside the locked transaction,
      // so relations are safe to join here.
      const withProperty = await this.disputeCasesRepository.findOne({
        where: { id: disputeCase.id },
        relations: ['property'],
      });

      const propertyAddress = this.buildPropertyAddress(withProperty?.property ?? null);

      return { alreadyApproved: false, propertyAddress };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getApprovalDocuments(token: string): Promise<ApprovalDocumentsResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { client_approval_token: token },
      relations: ['property', 'valuation_notice'],
    });

    if (!disputeCase) {
      throw new NotFoundException('Approval token is invalid or does not exist');
    }

    if (DisputeCasesService.isExpired(disputeCase.client_approval_token_expires_at)) {
      throw new GoneException('Approval token has expired — please request a new package from your adviser');
    }

    if (disputeCase.client_approved_at !== null) {
      return { alreadyApproved: true, documents: [] };
    }

    const docs = await this.packageDocumentRepo.find({
      where: { dispute_case_id: disputeCase.id, status: PackageDocumentStatus.READY },
    });

    const propertyAddress = this.buildPropertyAddress(disputeCase.property);
    const taxYear = String(new Date(disputeCase.valuation_notice.valuation_date).getFullYear());

    return {
      alreadyApproved: false,
      propertyAddress,
      taxYear,
      documents: docs
        .filter((doc): doc is PackageDocument & { blob_name: string } => doc.blob_name !== null)
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          viewUrl: this.azureBlobService.getFileUrl(doc.blob_name, DOCUMENT_VIEW_URL_EXPIRY_MINUTES),
        })),
    };
  }


  async findAdvisoryView(token: string): Promise<AnalysisReportResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { advisory_view_token: token },
      select: ['id', 'case_reference', 'analysis_report_blob_path', 'advisory_view_token_expires_at'],
    });

    if (!disputeCase) {
      throw new NotFoundException('Advisory view token is invalid or does not exist');
    }

    if (DisputeCasesService.isExpired(disputeCase.advisory_view_token_expires_at)) {
      throw new GoneException('Advisory view link has expired — please contact your adviser to request a new one');
    }

    if (!disputeCase.analysis_report_blob_path) {
      throw new NotFoundException('Analysis report is not yet available for this case');
    }

    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      analysis_report_url: this.azureBlobService.getFileUrl(disputeCase.analysis_report_blob_path, ADVISORY_REPORT_LINK_EXPIRY_MINUTES),
    };
  }

  async findNoObjectionReportUrl(id: string): Promise<AnalysisReportResponseDto> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      select: ['id', 'case_reference', 'analysis_report_blob_path'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    if (!disputeCase.analysis_report_blob_path) {
      throw new NotFoundException(`Analysis report is not yet available for case #${id}`);
    }
    return {
      id: disputeCase.id,
      case_reference: disputeCase.case_reference,
      analysis_report_url: this.azureBlobService.getFileUrl(disputeCase.analysis_report_blob_path, REPORT_LINK_EXPIRY_MINUTES),
    };
  }

  private static isExpired(expiresAt: Date | null | undefined): boolean {
    return !expiresAt || expiresAt < new Date();
  }

  private buildPropertyAddress(
    property: { address: string | null; suburb: string | null; state: string | null; postcode: string | null } | null,
  ): string {
    if (!property) return 'Address not available';
    return [property.address, property.suburb, property.state, property.postcode]
      .filter(Boolean)
      .join(', ');
  }

  private static formatAud(val: number): string {
    return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private buildAdvisoryEmailPayload(
    disputeCase: DisputeCase,
    dto: CloseNoObjectionDto,
    vgAssessedValue: number,
    closedAtDate: Date,
    viewReportUrl: string,
  ): Parameters<AzureEmailService['sendAdvisoryLetterNotification']>[0] {
    return {
      clientEmail: disputeCase.client.email!, // guarded by ClientEmailMissingException before this is called
      clientName: disputeCase.client.name,
      caseReference: disputeCase.case_reference,
      propertyAddress: this.buildPropertyAddress(disputeCase.property),
      vgAssessedValue: DisputeCasesService.formatAud(vgAssessedValue),
      internalAssessedValue: DisputeCasesService.formatAud(dto.internalAssessmentValue),
      assessorFullName: disputeCase.assigned_accountant?.fullName ?? 'Your YML Adviser',
      closedAt: closedAtDate.toLocaleString('en-AU', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
      viewReportUrl,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.disputeCasesRepository.findOne({ where: { id } });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }

}
