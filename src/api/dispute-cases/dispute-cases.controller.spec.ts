import { Test, TestingModule } from '@nestjs/testing';
import { DisputeCasesController } from './dispute-cases.controller';
import { DisputeCasesService } from './dispute-cases.service';

describe('DisputeCasesController', () => {
  let controller: DisputeCasesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputeCasesController],
      providers: [DisputeCasesService],
    }).compile();

    controller = module.get<DisputeCasesController>(DisputeCasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
