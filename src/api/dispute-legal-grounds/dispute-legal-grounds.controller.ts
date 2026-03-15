import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DisputeLegalGroundsService } from './dispute-legal-grounds.service';
import { CreateDisputeLegalGroundDto } from './dto/create-dispute-legal-ground.dto';
import { UpdateDisputeLegalGroundDto } from './dto/update-dispute-legal-ground.dto';

@Controller({
  path: 'dispute-legal-grounds',
  version: '1',
})
export class DisputeLegalGroundsController {
  constructor(private readonly disputeLegalGroundsService: DisputeLegalGroundsService) { }

  @Post()
  create(@Body() createDisputeLegalGroundDto: CreateDisputeLegalGroundDto) {
    return this.disputeLegalGroundsService.create(createDisputeLegalGroundDto);
  }

  @Get()
  findAll() {
    return this.disputeLegalGroundsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disputeLegalGroundsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDisputeLegalGroundDto: UpdateDisputeLegalGroundDto) {
    return this.disputeLegalGroundsService.update(+id, updateDisputeLegalGroundDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.disputeLegalGroundsService.remove(+id);
  }
}
