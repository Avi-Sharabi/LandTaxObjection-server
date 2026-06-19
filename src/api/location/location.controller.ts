import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCitiesQueryDto } from './dto/get-cities-query.dto';
import { SearchSuburbsQueryDto } from './dto/search-suburbs-query.dto';
import { StateResponseDto } from './dto/state.response.dto';
import { SuburbResponseDto } from './dto/suburb.response.dto';
import { LocationService } from './location.service';

@ApiTags('location')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'location', version: '1' })
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('australia/states')
  @ApiOperation({ summary: 'Get all Australian states, sorted alphabetically' })
  @ApiResponse({ status: 200, type: [StateResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 502, description: 'Upstream location API unavailable' })
  getAustraliaStates(): Promise<StateResponseDto[]> {
    return this.locationService.getAustraliaStates();
  }

  @Get('australia/cities')
  @ApiOperation({ summary: 'Get cities for an Australian state' })
  @ApiResponse({ status: 200, type: [String], description: 'List of city names' })
  @ApiResponse({ status: 400, description: 'state query param is required' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 502, description: 'Upstream location API unavailable' })
  getCitiesByState(@Query() query: GetCitiesQueryDto): Promise<string[]> {
    return this.locationService.getCitiesByState(query.state);
  }

  @Get('suburbs')
  @ApiOperation({ summary: 'Search Australian suburbs by state code and optional keyword' })
  @ApiResponse({ status: 200, type: [SuburbResponseDto] })
  @ApiResponse({ status: 400, description: 'state query param is required' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 502, description: 'Upstream location API unavailable' })
  searchSuburbs(@Query() query: SearchSuburbsQueryDto): Promise<SuburbResponseDto[]> {
    return this.locationService.searchSuburbs(query.state, query.q);
  }
}
