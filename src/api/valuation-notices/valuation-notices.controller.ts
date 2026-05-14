import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateValuationNoticeDto } from './dto/create-valuation-notice.dto';
import { UpdateValuationNoticeDto } from './dto/update-valuation-notice.dto';
import { ValuationNoticesService } from './valuation-notices.service';

@ApiTags('valuation-notices')
@UseGuards(JwtAuthGuard)
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
