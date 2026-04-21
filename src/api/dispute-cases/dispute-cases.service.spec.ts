import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCasesService } from './dispute-cases.service';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { DisputeCase, DisputeStatus, Jurisdiction } from './entities/dispute-case.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { ComparablesService } from '../comparables/comparables.service';
import { AuditLog, AuditAction } from '../audit-log/entities/audit-log.entity';
import { CaseAlreadySubmittedException } from './exceptions/case-already-submitted.exception';
import { CaseNotClientApprovedException } from './exceptions/case-not-client-approved.exception';

const CASE_ID = 'test-case-uuid';

function makeCase(overrides: Partial<DisputeCase> = {}): DisputeCase {
  return {
    id: CASE_ID,
    case_reference: 'YML-2024-001',
    client_id: 'client-uuid',
    property_id: 'property-uuid',
    valuation_notice_id: 'notice-uuid',
    assigned_accountant_id: null,
    assigned_lawyer_id: null,
    jurisdiction: Jurisdiction.NSW,
    status: DisputeStatus.APPRAISAL,
    statutory_deadline: new Date('2024-09-01'),
    no_legal_ground_flagged: false,
    client_approval_requested_at: null,
    client_approved_at: null,
    flag_heritage: false,
    flag_easement: false,
    flag_flood_zone: false,
    flag_environmental: false,
    flag_zoning: false,
    evidence_strength_score: null,
    outcome: null,
    invoice_amount: null,
    original_assessed_value: null,
    final_agreed_value: null,
    tax_saving_achieved: null,
    notes: null,
    submitted_at: null,
    lodgment_reference_number: null,
    closed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    valuation_notice: { id: 'notice-uuid', assessed_land_value: 1000000 },
    client: null,
    property: null,
    assigned_accountant: null,
    assigned_lawyer: null,
    legal_grounds: [],
    comparables: [],
    dispute_constraints: [],
    ...overrides,
  } as DisputeCase;
}

describe('DisputeCasesService — closeNoObjection', () => {
  let service: DisputeCasesService;
  let repo: jest.Mocked<Pick<Repository<DisputeCase>, 'findOne' | 'save'>>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeCasesService,
        { provide: getRepositoryToken(DisputeCase), useValue: repo },
        { provide: DisputeIntakeOrchestrator, useValue: {} },
        { provide: ComparablesService, useValue: {} },
      ],
    }).compile();

    service = module.get<DisputeCasesService>(DisputeCasesService);
  });

  describe('success path', () => {
    it('sets status to CLOSED_NO_OBJECTION and closes_at when internal value >= VG value', async () => {
      const disputeCase = makeCase();
      repo.findOne.mockResolvedValue(disputeCase);
      repo.save.mockImplementation(async (entity) => entity as DisputeCase);

      const dto: CloseNoObjectionDto = { internalAssessmentValue: 1200000 };

      const result = await service.closeNoObjection(CASE_ID, dto);

      expect(result.status).toBe(DisputeStatus.CLOSED_NO_OBJECTION);
      expect(result.closed_at).toBeInstanceOf(Date);
    });

    it('sets status when internal value equals the VG value exactly', async () => {
      const disputeCase = makeCase();
      repo.findOne.mockResolvedValue(disputeCase);
      repo.save.mockImplementation(async (entity) => entity as DisputeCase);

      const dto: CloseNoObjectionDto = { internalAssessmentValue: 1000000 };

      const result = await service.closeNoObjection(CASE_ID, dto);

      expect(result.status).toBe(DisputeStatus.CLOSED_NO_OBJECTION);
    });

    it('writes assessorNotes to case notes when provided', async () => {
      const disputeCase = makeCase();
      repo.findOne.mockResolvedValue(disputeCase);
      repo.save.mockImplementation(async (entity) => entity as DisputeCase);

      const dto: CloseNoObjectionDto = {
        internalAssessmentValue: 1200000,
        assessorNotes: 'VG value is fair based on market evidence.',
      };

      const result = await service.closeNoObjection(CASE_ID, dto);

      expect(result.notes).toBe('VG value is fair based on market evidence.');
    });

    it('does not overwrite existing notes when assessorNotes is omitted', async () => {
      const disputeCase = makeCase({ notes: 'Prior notes.' });
      repo.findOne.mockResolvedValue(disputeCase);
      repo.save.mockImplementation(async (entity) => entity as DisputeCase);

      const dto: CloseNoObjectionDto = { internalAssessmentValue: 1200000 };

      const result = await service.closeNoObjection(CASE_ID, dto);

      expect(result.notes).toBe('Prior notes.');
    });
  });

  describe('404 — case not found', () => {
    it('throws NotFoundException when the case does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.closeNoObjection('nonexistent-id', { internalAssessmentValue: 1200000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('409 — already closed', () => {
    it('throws ConflictException when status is CLOSED', async () => {
      repo.findOne.mockResolvedValue(makeCase({ status: DisputeStatus.CLOSED }));

      await expect(
        service.closeNoObjection(CASE_ID, { internalAssessmentValue: 1200000 }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when status is CLOSED_NO_OBJECTION', async () => {
      repo.findOne.mockResolvedValue(makeCase({ status: DisputeStatus.CLOSED_NO_OBJECTION }));

      await expect(
        service.closeNoObjection(CASE_ID, { internalAssessmentValue: 1200000 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('400 — internal value below VG value', () => {
    it('throws BadRequestException when internalAssessmentValue < VG assessed_land_value', async () => {
      const disputeCase = makeCase(); // VG value = 1,000,000
      repo.findOne.mockResolvedValue(disputeCase);

      await expect(
        service.closeNoObjection(CASE_ID, { internalAssessmentValue: 800000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('includes both values in the error message', async () => {
      const disputeCase = makeCase(); // VG value = 1,000,000
      repo.findOne.mockResolvedValue(disputeCase);

      await expect(
        service.closeNoObjection(CASE_ID, { internalAssessmentValue: 800000 }),
      ).rejects.toThrow(/800,000/);
    });
  });
});

// ──────────────────────────────────────────────────────────���──────────────────
// submitToVg
// ─────────────────────────────────────────────────────────────────────────────

const ASSESSOR_ID = 'assessor-uuid';
const ASSESSOR_NAME = 'Arvin Bermudez';

function makeApprovedCase(overrides: Partial<DisputeCase> = {}): DisputeCase {
  return makeCase({
    status: DisputeStatus.CLIENT_APPROVED,
    client: { id: 'client-uuid', name: 'John Smith', email: 'john@example.com' } as any,
    property: {
      address: '123 Test St',
      suburb: 'Testville',
      state: 'NSW',
      postcode: '2000',
    } as any,
    ...overrides,
  });
}

describe('DisputeCasesService — submitToVg', () => {
  let service: DisputeCasesService;
  let mockManager: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: typeof mockManager;
  };
  let mockEmailService: { sendVgSubmissionConfirmation: jest.Mock };
  let mockConfig: { getOrThrow: jest.Mock };

  beforeEach(async () => {
    mockManager = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (_entity: unknown, obj: unknown) => obj),
      create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
    };

    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: mockManager,
    };

    mockEmailService = {
      sendVgSubmissionConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      getOrThrow: jest.fn().mockReturnValue('vg@example.com'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeCasesService,
        { provide: 'DataSource', useValue: { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) } },
        { provide: getRepositoryToken(DisputeCase), useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(AuditLog), useValue: {} },
        { provide: DisputeIntakeOrchestrator, useValue: {} },
        { provide: ComparablesService, useValue: {} },
        { provide: 'AzureEmailService', useValue: mockEmailService },
        { provide: 'AzureBlobService', useValue: {} },
        { provide: 'ConfigService', useValue: mockConfig },
        { provide: getRepositoryToken('PackageDocument'), useValue: {} },
      ],
    }).compile();

    service = module.get<DisputeCasesService>(DisputeCasesService);
    // Wire DataSource directly since NestJS injection token for DataSource is the class itself
    (service as any).dataSource = { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) };
    (service as any).azureEmailService = mockEmailService;
    (service as any).config = mockConfig;
  });

  describe('success path', () => {
    it('sets status to SUBMITTED_TO_VG, assigns lodgment_reference_number, and sets submitted_at', async () => {
      mockManager.findOne.mockResolvedValue(makeApprovedCase());

      await service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME);

      const savedCase = mockManager.save.mock.calls[0][1] as DisputeCase;
      expect(savedCase.status).toBe(DisputeStatus.SUBMITTED_TO_VG);
      expect(savedCase.lodgment_reference_number).toBeTruthy();
      expect(savedCase.submitted_at).toBeInstanceOf(Date);
    });

    it('generates a lodgment reference matching LR-{YEAR}-{4CHARS}-{4DIGITS}', async () => {
      mockManager.findOne.mockResolvedValue(makeApprovedCase());

      await service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME);

      const savedCase = mockManager.save.mock.calls[0][1] as DisputeCase;
      expect(savedCase.lodgment_reference_number).toMatch(/^LR-\d{4}-[A-F0-9]{4}-\d{4}$/);
    });

    it('writes an audit log entry with the correct action, performedBy, caseId, and lodgmentReferenceNumber', async () => {
      mockManager.findOne.mockResolvedValue(makeApprovedCase());

      await service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME);

      const savedCase = mockManager.save.mock.calls[0][1] as DisputeCase;
      const auditEntry = mockManager.save.mock.calls[1][1] as AuditLog;
      expect(auditEntry.action).toBe(AuditAction.SUBMITTED_TO_VG);
      expect(auditEntry.performedBy).toBe(ASSESSOR_ID);
      expect(auditEntry.caseId).toBe(CASE_ID);
      expect(auditEntry.lodgmentReferenceNumber).toBe(savedCase.lodgment_reference_number);
    });

    it('commits the transaction after successful email send', async () => {
      mockManager.findOne.mockResolvedValue(makeApprovedCase());

      await service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME);

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });
  });

  describe('403 — case not client approved', () => {
    it('throws CaseNotClientApprovedException when status is AWAITING_CLIENT_APPROVAL', async () => {
      mockManager.findOne.mockResolvedValue(
        makeApprovedCase({ status: DisputeStatus.AWAITING_CLIENT_APPROVAL }),
      );

      await expect(
        service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME),
      ).rejects.toThrow(CaseNotClientApprovedException);
    });

    it('rolls back the transaction on 403 guard failure', async () => {
      mockManager.findOne.mockResolvedValue(
        makeApprovedCase({ status: DisputeStatus.AWAITING_CLIENT_APPROVAL }),
      );

      await expect(service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME)).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('409 — already submitted', () => {
    it('throws CaseAlreadySubmittedException when status is SUBMITTED_TO_VG', async () => {
      mockManager.findOne.mockResolvedValue(
        makeApprovedCase({ status: DisputeStatus.SUBMITTED_TO_VG }),
      );

      await expect(
        service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME),
      ).rejects.toThrow(CaseAlreadySubmittedException);
    });

    it('rolls back the transaction on 409 guard failure', async () => {
      mockManager.findOne.mockResolvedValue(
        makeApprovedCase({ status: DisputeStatus.SUBMITTED_TO_VG }),
      );

      await expect(service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME)).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('email failure causes rollback', () => {
    it('rolls back the transaction and rethrows when email send fails', async () => {
      mockManager.findOne.mockResolvedValue(makeApprovedCase());
      mockEmailService.sendVgSubmissionConfirmation.mockRejectedValue(
        new Error('ACS timeout'),
      );

      await expect(
        service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME),
      ).rejects.toThrow('ACS timeout');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('does not persist SUBMITTED_TO_VG status when email fails', async () => {
      mockManager.findOne.mockResolvedValue(makeApprovedCase());
      mockEmailService.sendVgSubmissionConfirmation.mockRejectedValue(
        new Error('ACS timeout'),
      );

      await expect(
        service.submitToVg(CASE_ID, ASSESSOR_ID, ASSESSOR_NAME),
      ).rejects.toThrow();

      // Both DB saves happened inside the rolled-back transaction — commit was never called
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});
