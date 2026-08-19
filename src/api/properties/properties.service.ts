import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { GetPropertiesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedPropertiesResponseDto } from '../../common/dto/paginated-response.dto';

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

  async findPaginated(
    query: GetPropertiesQueryDto,
  ): Promise<PaginatedPropertiesResponseDto> {
    const { page, limit, clientId } = query;

    const [data, total] = await this.propertiesRepository.findAndCount({
      where: { client_id: clientId },
      relations: { dispute_cases: true },
      // Query loading keeps joinAttributes empty, allowing TypeORM's count to
      // use COUNT(1) instead of COUNT(DISTINCT primary key), at the cost of
      // one follow-up query for the relation.
      relationLoadStrategy: 'query',
      // Only the relation is narrowed — naming no root columns leaves every
      // property column selected, which is what the list needs. id is
      // required here: the query relation loader matches cases by primary
      // key, so omitting it resolves the relation to an empty array.
      select: { dispute_cases: { id: true, case_reference: true } },
      // id tiebreaker: created_at alone can tie when intake creates several
      // properties in one batch, which would shuffle rows between pages.
      order: { created_at: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
