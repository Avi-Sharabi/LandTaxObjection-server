import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateValuationNoticeDto } from './dto/create-valuation-notice.dto';
import { UpdateValuationNoticeDto } from './dto/update-valuation-notice.dto';
import { ValuationNoticesService } from './valuation-notices.service';

@ApiTags('valuation-notices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'valuation-notices',
  version: '1',
})
export class ValuationNoticesController {
  constructor(private readonly valuationNoticesService: ValuationNoticesService) { }

  @Post()
  @ApiOperation({ summary: 'Create a valuation notice' })
  @ApiResponse({ status: 201, description: 'Valuation notice created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  create(@Body() createValuationNoticeDto: CreateValuationNoticeDto) {
    return this.valuationNoticesService.create(createValuationNoticeDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all valuation notices' })
  @ApiResponse({ status: 200, description: 'List of valuation notices' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  findAll() {
    return this.valuationNoticesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a valuation notice by ID' })
  @ApiParam({ name: 'id', description: 'Valuation notice UUID' })
  @ApiResponse({ status: 200, description: 'Valuation notice found' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Valuation notice not found' })
  findOne(@Param('id') id: string) {
    return this.valuationNoticesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a valuation notice' })
  @ApiParam({ name: 'id', description: 'Valuation notice UUID' })
  @ApiResponse({ status: 200, description: 'Valuation notice updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Valuation notice not found' })
  update(@Param('id') id: string, @Body() updateValuationNoticeDto: UpdateValuationNoticeDto) {
    return this.valuationNoticesService.update(id, updateValuationNoticeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a valuation notice' })
  @ApiParam({ name: 'id', description: 'Valuation notice UUID' })
  @ApiResponse({ status: 200, description: 'Valuation notice deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 404, description: 'Valuation notice not found' })
  remove(@Param('id') id: string) {
    return this.valuationNoticesService.remove(id);
  }
}
