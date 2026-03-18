import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { SiteConstraintsService } from './site-constraints.service';
import { SiteConstraint, ConstraintType, ConstraintDocStatus } from './entities/site-constraint.entity';
import { DisputeDocument } from '../dispute-documents/entities/dispute-document.entity';
import { AzureEmailService } from '../../common/azure-email/azure-email.service';
import { CreateSiteConstraintDto } from './dto/site-constraint.dto';

// ── Repo / Service mocks ──────────────────────────────────────────────────────

const mockConstraintRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockDocumentRepo = () => ({
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
  }),
});

const mockAzureEmail = () => ({
  sendConstraintDocumentRequest: jest.fn().mockResolvedValue(undefined),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SiteConstraintsService', () => {
  let service: SiteConstraintsService;
  let constraintRepo: ReturnType<typeof mockConstraintRepo>;
  let documentRepo: ReturnType<typeof mockDocumentRepo>;
  let azureEmail: ReturnType<typeof mockAzureEmail>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiteConstraintsService,
        { provide: getRepositoryToken(SiteConstraint), useFactory: mockConstraintRepo },
        { provide: getRepositoryToken(DisputeDocument), useFactory: mockDocumentRepo },
        { provide: AzureEmailService, useFactory: mockAzureEmail },
      ],
    }).compile();

    service       = module.get(SiteConstraintsService);
    constraintRepo = module.get(getRepositoryToken(SiteConstraint));
    documentRepo   = module.get(getRepositoryToken(DisputeDocument));
    azureEmail     = module.get(AzureEmailService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateSiteConstraintDto = {
      dispute_id: 'dispute-uuid-1',
      constraint_type: ConstraintType.FLOOD_ZONE_100YR,
    };

    it('creates and saves a new constraint', async () => {
      constraintRepo.findOne.mockResolvedValue(null);
      const mock = { id: 'sc-1', ...dto, email_sent: false, email_retry_count: 0, document_blob_url: null } as any;
      constraintRepo.create.mockReturnValue(mock);
      constraintRepo.save.mockResolvedValue(mock);

      // Mock the query builder for hasRequiredDocuments check
      constraintRepo.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const result = await service.create(dto);
      expect(result.id).toBe('sc-1');
      expect(constraintRepo.save).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException on duplicate constraint type for same dispute', async () => {
      constraintRepo.findOne.mockResolvedValue({ id: 'existing-sc' } as any);
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the constraint when found', async () => {
      const mock = { id: 'sc-1' } as any;
      constraintRepo.findOne.mockResolvedValue(mock);
      await expect(service.findOne('sc-1')).resolves.toEqual(mock);
    });

    it('throws NotFoundException when not found', async () => {
      constraintRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── runVerificationFlow ──────────────────────────────────────────────────────

  describe('runVerificationFlow', () => {
    const baseConstraint = {
      id: 'sc-1',
      dispute_id: 'disp-1',
      constraint_type: ConstraintType.FLOOD_ZONE_100YR,
      document_blob_url: null,
      email_sent: false,
      email_retry_count: 0,
      doc_status: ConstraintDocStatus.PENDING_DOCUMENTS,
    } as SiteConstraint;

    it('marks DOCUMENTS_UPLOADED when blob_url is set on the constraint', async () => {
      const withBlob = { ...baseConstraint, document_blob_url: 'https://blob/doc.pdf' };
      await service.runVerificationFlow(withBlob as SiteConstraint);
      expect(constraintRepo.update).toHaveBeenCalledWith('sc-1', {
        doc_status: ConstraintDocStatus.DOCUMENTS_UPLOADED,
      });
    });

    it('marks DOCUMENTS_UPLOADED when matching dispute_documents exist', async () => {
      documentRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      });
      await service.runVerificationFlow(baseConstraint);
      expect(constraintRepo.update).toHaveBeenCalledWith('sc-1', {
        doc_status: ConstraintDocStatus.DOCUMENTS_UPLOADED,
      });
    });

    it('sends email when no documents found and email not yet sent', async () => {
      documentRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });
      constraintRepo.createQueryBuilder = jest.fn().mockReturnValue({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          dispute: {
            case_reference: 'YML-2026-001',
            client: { email: 'client@example.com' },
          },
        }),
      });

      await service.runVerificationFlow(baseConstraint);

      expect(azureEmail.sendConstraintDocumentRequest).toHaveBeenCalledTimes(1);
      expect(constraintRepo.update).toHaveBeenCalledWith(
        'sc-1',
        expect.objectContaining({ email_sent: true, email_retry_count: 1 }),
      );
    });

    it('does NOT re-send email if already sent', async () => {
      documentRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });
      const alreadySent = { ...baseConstraint, email_sent: true };
      await service.runVerificationFlow(alreadySent as SiteConstraint);
      expect(azureEmail.sendConstraintDocumentRequest).not.toHaveBeenCalled();
    });
  });

  // ── retryVerification ────────────────────────────────────────────────────────

  describe('retryVerification', () => {
    it('skips constraints already resolved', async () => {
      constraintRepo.findOne.mockResolvedValue({
        id: 'sc-1',
        doc_status: ConstraintDocStatus.DOCUMENTS_UPLOADED,
      } as any);
      await service.retryVerification('sc-1');
      expect(documentRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});

// ── Controller smoke test (matches existing spec style) ──────────────────────

import { SiteConstraintsController } from './site-constraints.controller';

describe('SiteConstraintsController', () => {
  let controller: SiteConstraintsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SiteConstraintsController],
      providers: [
        {
          provide: SiteConstraintsService,
          useValue: {
            create: jest.fn(),
            findByDispute: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            retryVerification: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SiteConstraintsController>(SiteConstraintsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
