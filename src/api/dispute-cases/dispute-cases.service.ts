import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDisputeCaseDto } from './dto/create-dispute-case.dto';
import { UpdateDisputeCaseDto } from './dto/update-dispute-case.dto';
import { CreateDisputeIntakeDto } from './dto/create-dispute-intake.dto';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeIntakeOrchestrator } from './intake/dispute-intake.orchestrator';

@Injectable()
export class DisputeCasesService {
  constructor(
    private readonly intakeOrchestrator: DisputeIntakeOrchestrator,
    @InjectRepository(DisputeCase)
    private disputeCasesRepository: Repository<DisputeCase>,
  ) {}

  create(createDisputeCaseDto: CreateDisputeCaseDto) {
    return 'This action adds a new disputeCase';
  }

  async submitIntakeApplication(intakeDto: CreateDisputeIntakeDto) {
    return this.intakeOrchestrator.submitIntakeApplication(intakeDto);
  }

  async findAll(): Promise<DisputeCase[]> {
    return this.disputeCasesRepository.find({
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds'],
    });
  }

  async findOne(id: string): Promise<DisputeCase> {
    const disputeCase = await this.disputeCasesRepository.findOne({
      where: { id },
      relations: ['client', 'property', 'valuation_notice', 'assigned_accountant', 'assigned_lawyer', 'legal_grounds'],
    });
    if (!disputeCase) throw new NotFoundException(`Dispute case #${id} not found`);
    return disputeCase;
  }

  async update(id: string, updateDisputeCaseDto: UpdateDisputeCaseDto): Promise<DisputeCase> {
    const disputeCase = await this.findOne(id);
    Object.assign(disputeCase, updateDisputeCaseDto);
    return this.disputeCasesRepository.save(disputeCase);
  }

  async remove(id: string): Promise<{ message: string }> {
    const disputeCase = await this.findOne(id);
    await this.disputeCasesRepository.remove(disputeCase);
    return { message: `Dispute case #${id} removed` };
  }
}