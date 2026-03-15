import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ValuationNoticesService } from './valuation-notices.service';
import { CreateValuationNoticeDto } from './dto/create-valuation-notice.dto';
import { UpdateValuationNoticeDto } from './dto/update-valuation-notice.dto';

@Controller({
  path: 'valuation-notices',
  version: '1',
})
export class ValuationNoticesController {
  constructor(private readonly valuationNoticesService: ValuationNoticesService) { }

  @Post()
  create(@Body() createValuationNoticeDto: CreateValuationNoticeDto) {
    return this.valuationNoticesService.create(createValuationNoticeDto);
  }

  @Get()
  findAll() {
    return this.valuationNoticesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.valuationNoticesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateValuationNoticeDto: UpdateValuationNoticeDto) {
    return this.valuationNoticesService.update(id, updateValuationNoticeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.valuationNoticesService.remove(id);
  }
}
