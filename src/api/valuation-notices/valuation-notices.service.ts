import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValuationNotice } from './entities/valuation-notice.entity';
import { CreateValuationNoticeDto } from './dto/create-valuation-notice.dto';
import { UpdateValuationNoticeDto } from './dto/update-valuation-notice.dto';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';

@Injectable()
export class ValuationNoticesService {
  constructor(
    @InjectRepository(ValuationNotice)
    private readonly valuationNoticesRepository: Repository<ValuationNotice>,
    private readonly azureBlobService: AzureBlobService,
  ) { }

  private mapWithFileUrl(notice: ValuationNotice) {
    const filePath = notice.source_document?.file_path ?? null;
    return {
      ...notice,
      file_url: this.azureBlobService.getFileUrl(filePath),
    };
  }

  create(dto: CreateValuationNoticeDto): Promise<ValuationNotice> {
    const notice = this.valuationNoticesRepository.create(dto);
    return this.valuationNoticesRepository.save(notice);
  }

  async findAll() {
    return this.valuationNoticesRepository.find();
  }

  async findOne(id: string) {
    const notice = await this.valuationNoticesRepository.findOne({
      where: { id },
      relations: ['property', 'dispute_cases', 'source_document'],
    });
    if (!notice) throw new NotFoundException(`Valuation notice #${id} not found`);
    return this.mapWithFileUrl(notice);
  }

  async update(id: string, dto: UpdateValuationNoticeDto) {
    const notice = await this.valuationNoticesRepository.findOne({ where: { id } });
    if (!notice) throw new NotFoundException(`Valuation notice #${id} not found`);
    Object.assign(notice, dto);
    const updated = await this.valuationNoticesRepository.save(notice);
    return this.mapWithFileUrl(updated);
  }

  async remove(id: string): Promise<void> {
    const notice = await this.valuationNoticesRepository.findOne({ where: { id } });
    if (!notice) throw new NotFoundException(`Valuation notice #${id} not found`);
    await this.valuationNoticesRepository.remove(notice);
  }
}
