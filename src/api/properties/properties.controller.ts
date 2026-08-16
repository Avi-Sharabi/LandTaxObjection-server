import { Controller, Body, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { GetPropertiesQueryDto } from '../../common/dto/paginated-query.dto';
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

  // Accountant-only (not JWT-only like clients/paginated or dispute-cases/paginated):
  // clientId is optional here, so a bare GET would return every property of every
  // client to any authenticated user. Matches the @Roles gate already on PATCH below.
  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @Get()
  findAll(@Query() query: GetPropertiesQueryDto) {
    return this.propertiesService.findAllPaginated(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }
}
