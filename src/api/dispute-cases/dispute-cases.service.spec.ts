import { Test, TestingModule } from '@nestjs/testing';
import { DisputeCasesService } from './dispute-cases.service';

describe('DisputeCasesService', () => {
  let service: DisputeCasesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DisputeCasesService],
    }).compile();

    service = module.get<DisputeCasesService>(DisputeCasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
