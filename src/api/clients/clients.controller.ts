import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { AcceptTCDto } from './dto/accept-tc.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { AcceptTcResponseDto } from './dto/accept-tc-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
