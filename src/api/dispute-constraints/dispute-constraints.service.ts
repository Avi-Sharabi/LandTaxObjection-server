import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DisputeConstraint } from './entities/dispute-constraint.entity';
import { ConstraintFile } from '../constraint-files/entities/constraint-file.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { ConstraintType } from '../site-constraints/entities/site-constraints.entity';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { CreateDisputeConstraintDto, UpdateDisputeConstraintDto, ConstraintFileInputDto } from './dto/create-dispute-constraint.dto';
import { UploadConstraintFilesDto } from './dto/upload-constraint-files.dto';
import { DisputeConstraintResponseDto, ConstraintFileUrlDto } from './dto/dispute-constraint-response.dto';
import { UploadStatus, UploadedByRole } from '../valuation-notices/entities/valuation-notice-file.entity';

@Injectable()
export class DisputeConstraintsService {
  private readonly logger = new Logger(DisputeConstraintsService.name);

  constructor(
    @InjectRepository(DisputeConstraint)
    private readonly constraintRepo: Repository<DisputeConstraint>,
    @InjectRepository(ConstraintFile)
    private readonly fileRepo: Repository<ConstraintFile>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepo: Repository<DisputeCase>,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateDisputeConstraintDto, userId: string): Promise<DisputeConstraintResponseDto> {
    const disputeCase = await this.assertDisputeCaseExists(dto.dispute_id);

    const constraint = this.constraintRepo.create({
      dispute_id:      dto.dispute_id,
      constraint_type: dto.constraint_type,
      description:     dto.description    ?? null,
      disputed_value:  dto.disputed_value != null ? String(dto.disputed_value) : null,
      sort_order:      dto.sort_order     ?? 0,
    });

    const saved = await this.constraintRepo.save(constraint);

    if (dto.files?.length) {
      await this.persistFiles(
        saved.id,
        saved.constraint_type,
        disputeCase,
        dto.files,
        userId,
        dto.uploaded_by_role ?? UploadedByRole.STAFF,
      );
    }

    return this.toDto(saved, dto.files?.length ?? 0);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(constraintId: string, dto: UpdateDisputeConstraintDto): Promise<DisputeConstraintResponseDto> {
    const constraint = await this.loadConstraintWithFiles(constraintId);

    if (dto.description   !== undefined) constraint.description   = dto.description ?? null;
    if (dto.disputed_value !== undefined) constraint.disputed_value = dto.disputed_value != null ? String(dto.disputed_value) : null;
    if (dto.sort_order    !== undefined) constraint.sort_order    = dto.sort_order;

    const saved = await this.constraintRepo.save(constraint);
    return this.toDto(saved, saved.files?.length ?? 0);
  }

  // ── LIST BY DISPUTE ────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<DisputeConstraintResponseDto[]> {
    const exists = await this.disputeCaseRepo.existsBy({ id: disputeId });
    if (!exists) throw new NotFoundException(`Dispute case ${disputeId} not found.`);

    const constraints = await this.constraintRepo.find({
      where: { dispute_id: disputeId },
      relations: ['files'],
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });

    return constraints.map((c) => this.toDto(c, c.files?.length ?? 0));
  }

  // ── GET FILE URLS ──────────────────────────────────────────────────────────

  async getFileUrls(constraintId: string): Promise<ConstraintFileUrlDto[]> {
    const constraint = await this.loadConstraintWithFiles(constraintId);

    return constraint.files.map((f) => ({
      id:            f.id,
      url:           this.azureBlobService.getFileUrl(f.blob_path) ?? '',
      original_name: f.original_name,
      mime_type:     f.mime_type,
    }));
  }

  // ── ADD FILES TO EXISTING CONSTRAINT ──────────────────────────────────────

  async addFiles(
    constraintId: string,
    dto: UploadConstraintFilesDto,
    userId: string,
  ): Promise<ConstraintFileUrlDto[]> {
    const constraint  = await this.loadConstraintWithFiles(constraintId);
    const disputeCase = await this.assertDisputeCaseExists(constraint.dispute_id);

    await this.persistFiles(
      constraintId,
      constraint.constraint_type,
      disputeCase,
      dto.files,
      userId,
      dto.uploaded_by_role ?? UploadedByRole.STAFF,
    );

    return this.getFileUrls(constraintId);
  }

  // ── DELETE CONSTRAINT ──────────────────────────────────────────────────────

  async remove(constraintId: string): Promise<void> {
    const constraint = await this.loadConstraintWithFiles(constraintId);

    await Promise.all(
      constraint.files.map((f) =>
        this.azureBlobService.deleteFile(f.blob_path).catch((err: unknown) =>
          this.logger.warn(
            `[DISPUTE-CONSTRAINT] Blob delete failed — fileId=${f.id} blob=${f.blob_path} err=${err instanceof Error ? err.message : String(err)}`,
          ),
        ),
      ),
    );

    await this.constraintRepo.remove(constraint);
    this.logger.log(`[DISPUTE-CONSTRAINT] Removed — id=${constraintId}`);
  }

  // ── DELETE SINGLE FILE ─────────────────────────────────────────────────────

  async removeFile(constraintId: string, fileId: string): Promise<void> {
    const file = await this.fileRepo.findOne({
      where: { id: fileId, dispute_constraint_id: constraintId },
    });
    if (!file) {
      throw new NotFoundException(`File ${fileId} not found on constraint ${constraintId}.`);
    }

    await this.azureBlobService.deleteFile(file.blob_path).catch((err: unknown) =>
      this.logger.warn(
        `[DISPUTE-CONSTRAINT] Blob delete failed — fileId=${fileId} blob=${file.blob_path} err=${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    await this.fileRepo.remove(file);
    this.logger.log(`[DISPUTE-CONSTRAINT] File removed — constraintId=${constraintId} fileId=${fileId}`);
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  /**
   * Uploads all files in parallel and persists a ConstraintFile row for each.
   * Blob path: clients/{clientId}/disputes/{disputeId}/constraints/{constraintId}/{fileId}.ext
   */
  private async persistFiles(
    constraintId: string,
    constraintType: ConstraintType,
    disputeCase: DisputeCase,
    files: ConstraintFileInputDto[],
    userId: string,
    role: UploadedByRole,
  ): Promise<void> {
    await Promise.all(
      files.map(async (input) => {
        const blobPath = `clients/${disputeCase.client_id}/disputes/${disputeCase.id}/constraints/${constraintType}/${input.name}`;

        await this.azureBlobService.uploadFile(blobPath, input.data);

        const record = this.fileRepo.create({
          dispute_constraint_id: constraintId,
          document_category:     constraintType,
          blob_path:             blobPath,
          original_name:         input.name,
          mime_type:             input.mime_type,
          file_size_bytes:       Buffer.from(input.data, 'base64').length,
          upload_status:         UploadStatus.COMPLETE,
          uploaded_by:           userId,
          uploaded_by_role:      role,
          confirmed_by:          null,
          confirmed_at:          null,
        });

        await this.fileRepo.save(record);

        this.logger.log(
          `[DISPUTE-CONSTRAINT] File uploaded — constraintId=${constraintId} name=${input.name} blob=${blobPath}`,
        );
      }),
    );
  }

  private async loadConstraintWithFiles(constraintId: string): Promise<DisputeConstraint> {
    const constraint = await this.constraintRepo.findOne({
      where: { id: constraintId },
      relations: ['files'],
    });
    if (!constraint) throw new NotFoundException(`Dispute constraint ${constraintId} not found.`);
    return constraint;
  }

  private async assertDisputeCaseExists(disputeId: string): Promise<DisputeCase> {
    const disputeCase = await this.disputeCaseRepo.findOne({ where: { id: disputeId } });
    if (!disputeCase) throw new NotFoundException(`Dispute case ${disputeId} not found.`);
    return disputeCase;
  }

  private toDto(entity: DisputeConstraint, fileCount: number): DisputeConstraintResponseDto {
    const dto = new DisputeConstraintResponseDto();
    dto.id              = entity.id;
    dto.dispute_id      = entity.dispute_id;
    dto.constraint_type = entity.constraint_type;
    dto.description     = entity.description;
    dto.disputed_value  = entity.disputed_value;
    dto.sort_order      = entity.sort_order;
    dto.file_count      = fileCount;
    dto.has_files       = fileCount > 0;
    dto.created_at      = entity.created_at;
    return dto;
  }
}
