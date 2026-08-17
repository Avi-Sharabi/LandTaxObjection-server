import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { PackageDocument } from './entities/package-document.entity';

@Injectable()
export class ObjectionPackageRepository {
  constructor(
    @InjectRepository(PackageDocument)
    private readonly packageDocumentRepo: Repository<PackageDocument>,
    @InjectRepository(DisputeCase)
    private readonly disputeCaseRepo: Repository<DisputeCase>,
  ) {}

  findDocumentsByCaseId(disputeCaseId: string): Promise<PackageDocument[]> {
    return this.packageDocumentRepo.find({
      where: { dispute_case_id: disputeCaseId },
      order: { category: 'ASC' },
    });
  }

  // valuation_notice is required: without the relation the decision_outcome gate silently no-ops
  // and advisory cases become package-eligible.
  findDisputeCase(id: string): Promise<DisputeCase | null> {
    return this.disputeCaseRepo.findOne({
      where: { id },
      relations: { valuation_notice: true },
    });
  }
}
