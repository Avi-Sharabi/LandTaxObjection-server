import { Injectable } from '@nestjs/common';
import { CreateDisputeLegalGroundDto } from './dto/create-dispute-legal-ground.dto';
import { UpdateDisputeLegalGroundDto } from './dto/update-dispute-legal-ground.dto';

@Injectable()
export class DisputeLegalGroundsService {
  create(createDisputeLegalGroundDto: CreateDisputeLegalGroundDto) {
    return 'This action adds a new disputeLegalGround';
  }

  findAll() {
    return `This action returns all disputeLegalGrounds`;
  }

  findOne(id: number) {
    return `This action returns a #${id} disputeLegalGround`;
  }

  update(id: number, updateDisputeLegalGroundDto: UpdateDisputeLegalGroundDto) {
    return `This action updates a #${id} disputeLegalGround`;
  }

  remove(id: number) {
    return `This action removes a #${id} disputeLegalGround`;
  }
}
