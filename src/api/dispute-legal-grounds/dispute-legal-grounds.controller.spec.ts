import { Test, TestingModule } from '@nestjs/testing';
import { DisputeLegalGroundsController } from './dispute-legal-grounds.controller';
import { DisputeLegalGroundsService } from './dispute-legal-grounds.service';

describe('DisputeLegalGroundsController', () => {
  let controller: DisputeLegalGroundsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputeLegalGroundsController],
      providers: [DisputeLegalGroundsService],
    }).compile();

    controller = module.get<DisputeLegalGroundsController>(DisputeLegalGroundsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
