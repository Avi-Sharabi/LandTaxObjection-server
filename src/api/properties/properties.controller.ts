import { Controller, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller({
  path: 'properties',
  version: '1',
})
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }
}
