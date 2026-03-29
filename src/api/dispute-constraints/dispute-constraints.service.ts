import { Injectable, Logger } from '@nestjs/common';

import { DisputeConstraint } from './entities/dispute-constraint.entity';
import { ConstraintType } from './entities/constraint-type.enum';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';
import { CreateDisputeConstraintDto, ConstraintFileInputDto } from './dto/create-dispute-constraint.dto';
import { UpdateDisputeConstraintDto } from './dto/update-dispute-constraint.dto';
import { DisputeConstraintResponseDto } from './dto/dispute-constraint-response.dto';
import { DisputeConstraintsRepository } from './dispute-constraints.repository';
import { DisputeConstraintNotFoundException } from './exceptions/dispute-constraint-not-found.exception';
import { DisputeCaseNotFoundException } from './exceptions/dispute-case-not-found.exception';
import { UploadStatus, UploadedByRole } from '../valuation-notices/entities/valuation-notice-file.entity';

interface PersistFilesOptions {
  constraintId:   string;
  constraintType: ConstraintType;
  disputeCase:    DisputeCase;
  files:          ConstraintFileInputDto[];
  userId:         string;
  role:           UploadedByRole;
}

@Injectable()
export class DisputeConstraintsService {
  private readonly logger = new Logger(DisputeConstraintsService.name);

  constructor(
    private readonly repository: DisputeConstraintsRepository,
    private readonly azureBlobService: AzureBlobService,
  ) { }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateDisputeConstraintDto, userId: string): Promise<DisputeConstraintResponseDto> {
    const disputeCase = await this.assertDisputeCaseExists(dto.dispute_id);

    const saved = await this.repository.createAndSaveConstraint({
      dispute_id: dto.dispute_id,
      constraint_type: dto.constraint_type,
      description: dto.description ?? null,
    });

    if (dto.files?.length) {
      await this.persistFiles({
        constraintId:   saved.id,
        constraintType: saved.constraint_type,
        disputeCase,
        files:          dto.files,
        userId,
        role:           dto.uploaded_by_role ?? UploadedByRole.STAFF,
      });
    }

    const fresh = await this.loadConstraintWithFiles(saved.id);
    return this.toDto(fresh);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async update(constraintId: string, dto: UpdateDisputeConstraintDto, userId: string): Promise<DisputeConstraintResponseDto> {
    const constraint = await this.loadConstraintWithFiles(constraintId);

    if (dto.description !== undefined) constraint.description = dto.description ?? null;

    if (dto.keep_file_ids !== undefined) {
      const toDelete = constraint.files.filter((f) => !dto.keep_file_ids!.includes(f.id));
      await Promise.all(
        toDelete.map((f) =>
          this.azureBlobService.deleteFile(f.blob_path).catch((err: unknown) =>
            this.logger.warn(
              `[DISPUTE-CONSTRAINT] Blob delete failed — fileId=${f.id} blob=${f.blob_path} err=${err instanceof Error ? err.message : String(err)}`,
            ),
          ),
        ),
      );
      await this.repository.removeFiles(toDelete);
    }

    await this.repository.saveConstraint(constraint);

    if (dto.files?.length) {
      const disputeCase = await this.assertDisputeCaseExists(constraint.dispute_id);
      await this.persistFiles({
        constraintId,
        constraintType: constraint.constraint_type,
        disputeCase,
        files:          dto.files,
        userId,
        role:           dto.uploaded_by_role ?? UploadedByRole.STAFF,
      });
    }

    const updated = await this.loadConstraintWithFiles(constraintId);
    return this.toDto(updated);
  }

  // ── LIST BY DISPUTE ────────────────────────────────────────────────────────

  async findByDispute(disputeId: string): Promise<DisputeConstraintResponseDto[]> {
    const exists = await this.repository.disputeCaseExists(disputeId);
    if (!exists) throw new DisputeCaseNotFoundException(disputeId);

    const constraints = await this.repository.findByDisputeId(disputeId);
    return constraints.map((c) => this.toDto(c));
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

    await this.repository.removeConstraint(constraint);
    this.logger.log(`[DISPUTE-CONSTRAINT] Removed — id=${constraintId}`);
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private async persistFiles(opts: PersistFilesOptions): Promise<void> {
    const { constraintId, constraintType, disputeCase, files, userId, role } = opts;
    await Promise.all(
      files.map(async (input) => {
        const blobPath = `clients/${disputeCase.client_id}/disputes/${disputeCase.id}/constraints/${constraintType}/${input.name}`;

        await this.azureBlobService.uploadFile(blobPath, input.data);

        await this.repository.createAndSaveFile({
          dispute_constraint_id: constraintId,
          document_category: constraintType,
          blob_path: blobPath,
          original_name: input.name,
          file_size_bytes: Buffer.from(input.data, 'base64').length,
          upload_status: UploadStatus.COMPLETE,
          uploaded_by: userId,
          uploaded_by_role: role,
          confirmed_by: null,
          confirmed_at: null,
        });

        this.logger.log(
          `[DISPUTE-CONSTRAINT] File uploaded — constraintId=${constraintId} name=${input.name} blob=${blobPath}`,
        );
      }),
    );
  }

  private async loadConstraintWithFiles(constraintId: string): Promise<DisputeConstraint> {
    const constraint = await this.repository.findConstraintWithFiles(constraintId);
    if (!constraint) throw new DisputeConstraintNotFoundException(constraintId);
    return constraint;
  }

  private async assertDisputeCaseExists(disputeId: string): Promise<DisputeCase> {
    const disputeCase = await this.repository.findDisputeCase(disputeId);
    if (!disputeCase) throw new DisputeCaseNotFoundException(disputeId);
    return disputeCase;
  }

  private toDto(entity: DisputeConstraint): DisputeConstraintResponseDto {
    const dto = new DisputeConstraintResponseDto();
    dto.id = entity.id;
    dto.dispute_id = entity.dispute_id;
    dto.constraint_type = entity.constraint_type;
    dto.description = entity.description;
    dto.files = (entity.files ?? []).map((f) => ({
      id: f.id,
      url: this.azureBlobService.getFileUrl(f.blob_path, 60, 'inline') ?? '',
      download_url: this.azureBlobService.getFileUrl(f.blob_path, 60, `attachment; filename="${f.original_name}"`) ?? '',
      original_name: f.original_name,
    }));
    dto.created_at = entity.created_at;
    return dto;
  }
}
