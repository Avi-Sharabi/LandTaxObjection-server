import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DisputeConstraint } from './entities/dispute-constraint.entity';
import { ConstraintFile } from '../constraint-files/entities/constraint-file.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';

@Injectable()
export class DisputeConstraintsRepository {
  constructor(
    @InjectRepository(DisputeConstraint)
    private readonly constraintRepo: Repository<DisputeConstraint>,
    @InjectRepository(ConstraintFile)
    private readonly fileRepo: Repository<ConstraintFile>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepo: Repository<DisputeCase>,
  ) {}

  async findDisputeCase(disputeId: string): Promise<DisputeCase | null> {
    return this.disputeCaseRepo.findOne({ where: { id: disputeId } });
  }

  async disputeCaseExists(disputeId: string): Promise<boolean> {
    return this.disputeCaseRepo.existsBy({ id: disputeId });
  }

  async findConstraintWithFiles(id: string): Promise<DisputeConstraint | null> {
    return this.constraintRepo.findOne({ where: { id }, relations: ['files'] });
  }

  async findByDisputeId(disputeId: string): Promise<DisputeConstraint[]> {
    return this.constraintRepo.find({
      where: { dispute_id: disputeId },
      relations: ['files'],
      order: { created_at: 'ASC' },
    });
  }

  async createAndSaveConstraint(data: Partial<DisputeConstraint>): Promise<DisputeConstraint> {
    const entity = this.constraintRepo.create(data);
    return this.constraintRepo.save(entity);
  }

  async saveConstraint(constraint: DisputeConstraint): Promise<DisputeConstraint> {
    return this.constraintRepo.save(constraint);
  }

  async removeConstraint(constraint: DisputeConstraint): Promise<void> {
    await this.constraintRepo.remove(constraint);
  }

  async createAndSaveFile(data: Partial<ConstraintFile>): Promise<ConstraintFile> {
    const entity = this.fileRepo.create(data);
    return this.fileRepo.save(entity);
  }

  async removeFiles(files: ConstraintFile[]): Promise<void> {
    if (files.length) await this.fileRepo.remove(files);
  }
}
