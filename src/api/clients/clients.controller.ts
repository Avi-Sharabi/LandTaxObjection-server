import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Query, UseGuards, Req } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientInfoDto } from './dto/update-client-info.dto';
import { AcceptTCDto } from './dto/accept-tc.dto';
import { GetClientsQueryDto } from '../../common/dto/paginated-query.dto';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AcceptTcResponseDto } from './dto/accept-tc-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(JwtAuthGuard) 
@Controller({
  path: 'clients',
  version: '1',
})
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) { }

  @Post()
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto);
  }

  @Patch(':id/accept-tc')
  @ApiOperation({ summary: 'Accept T&C for a client and trigger FYI document upload' })
  @ApiParam({ name: 'id', description: 'Client UUID' })
  @ApiResponse({ status: 200, type: AcceptTcResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid status transition or FYI not linked' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async acceptTc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() acceptTCDto: AcceptTCDto,
  ): Promise<AcceptTcResponseDto> {
    return this.clientsService.acceptTc(id, acceptTCDto);
  }


  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @Get('paginated')
  findPaginated(@Query() query: GetClientsQueryDto) {
    return this.clientsService.findPaginated(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client information' })
  @ApiParam({ name: 'id', description: 'Client UUID' })
  @ApiResponse({ status: 200, description: 'Client updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientInfoDto) {
    return this.clientsService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTANT, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a client and all their associated dispute cases' })
  @ApiParam({ name: 'id', description: 'Client UUID' })
  @ApiResponse({ status: 200, description: 'Client deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — accountant or admin role required' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.clientsService.remove(id, req.user.id);
  }
}
