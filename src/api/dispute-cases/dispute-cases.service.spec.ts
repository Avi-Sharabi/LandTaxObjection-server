import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCasesService } from './dispute-cases.service';
import { CloseNoObjectionDto } from './dto/close-no-objection.dto';
import { DisputeCase, DisputeStatus, Jurisdiction } from './entities/dispute-case.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';
import { ComparablesService } from '../comparables/comparables.service';

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
