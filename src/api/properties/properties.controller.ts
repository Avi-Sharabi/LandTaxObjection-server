import {
  Controller,
  Body,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { GetPropertiesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedPropertiesResponseDto } from '../../common/dto/paginated-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'properties',
  version: '1',
})
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  // Accountant-only — deliberately NOT JWT-only like clients/paginated or
  // dispute-cases/paginated, even though the path below now matches theirs.
  // clientId is the only thing standing between this route and every property
  // of every client, so the stricter guard stays regardless of the path
  // matching siblings. Do not loosen this to JWT-only when "aligning" further.
  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @Get('paginated')
  @ApiOperation({
    summary: "List a client's properties, paginated",
    description:
      'Numeric fields (ownership_pct, land_area_sqm, land_area_eplanning_sqm, height_limit_m) ' +
      'are returned as strings because the underlying Postgres numeric columns have no ' +
      'coercing transformer. dispute_cases is trimmed to id and case_reference.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of properties',
    type: PaginatedPropertiesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (e.g. missing or invalid clientId)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — accountant role required',
  })
  findPaginated(
    @Query() query: GetPropertiesQueryDto,
  ): Promise<PaginatedPropertiesResponseDto> {
    return this.propertiesService.findPaginated(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTANT)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, updatePropertyDto);
  }
}
