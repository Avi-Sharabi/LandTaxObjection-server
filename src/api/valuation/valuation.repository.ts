import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';

@Injectable()
export class ValuationRepository {
  constructor(
    @InjectRepository(ValuationNotice)
    private readonly noticeRepo: Repository<ValuationNotice>,
    @InjectRepository(DisputeCase)
    private readonly disputeRepo: Repository<DisputeCase>,
  ) {}

  findNoticeById(id: string): Promise<ValuationNotice | null> {
    return this.noticeRepo.findOne({ where: { id } });
  }

  saveNotice(notice: ValuationNotice): Promise<ValuationNotice> {
    return this.noticeRepo.save(notice);
  }

  findDisputeCaseById(id: string): Promise<DisputeCase | null> {
    return this.disputeRepo.findOne({ where: { id } });
  }
}
