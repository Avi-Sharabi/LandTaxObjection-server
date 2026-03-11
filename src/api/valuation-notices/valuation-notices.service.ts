import { Injectable } from '@nestjs/common';
import { CreateValuationNoticeDto } from './dto/create-valuation-notice.dto';
import { UpdateValuationNoticeDto } from './dto/update-valuation-notice.dto';

@Injectable()
export class ValuationNoticesService {
  create(createValuationNoticeDto: CreateValuationNoticeDto) {
    return 'This action adds a new valuationNotice';
  }

  findAll() {
    return `This action returns all valuationNotices`;
  }

  findOne(id: number) {
    return `This action returns a #${id} valuationNotice`;
  }

  update(id: number, updateValuationNoticeDto: UpdateValuationNoticeDto) {
    return `This action updates a #${id} valuationNotice`;
  }

  remove(id: number) {
    return `This action removes a #${id} valuationNotice`;
  }
}
