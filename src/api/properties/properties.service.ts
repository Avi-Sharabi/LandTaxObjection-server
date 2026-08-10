import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
  ) {}

  async findOne(id: string): Promise<Property> {
    const property = await this.propertiesRepository.findOne({ where: { id } });
    if (!property) throw new NotFoundException(`Property #${id} not found`);
    return property;
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.findOne(id);
    Object.assign(property, dto);
    return this.propertiesRepository.save(property);
  }
}
