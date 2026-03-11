import { PartialType } from '@nestjs/mapped-types';
import { CreateValuationNoticeDto } from './create-valuation-notice.dto';

export class UpdateValuationNoticeDto extends PartialType(CreateValuationNoticeDto) {}
