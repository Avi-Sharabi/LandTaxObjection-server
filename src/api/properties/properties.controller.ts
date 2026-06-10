import { Controller, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller({
  path: 'properties',
  version: '1',
})
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }
}
