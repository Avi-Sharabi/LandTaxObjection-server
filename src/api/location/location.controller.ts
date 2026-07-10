import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchCitiesQueryDto } from './dto/search-cities-query.dto';
import { CityResponseDto } from './dto/city.response.dto';
import { LocationService } from './location.service';

@ApiTags('location')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'location', version: '1' })
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('cities')
  @ApiOperation({ summary: 'Search Australian cities by state code' })
  @ApiResponse({ status: 200, type: [CityResponseDto] })
  @ApiResponse({ status: 400, description: 'state query param is required' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 502, description: 'Upstream location API unavailable' })
  searchCities(@Query() query: SearchCitiesQueryDto): Promise<CityResponseDto[]> {
    return this.locationService.searchCities(query.state);
  }
}
