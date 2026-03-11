import { Test, TestingModule } from '@nestjs/testing';
import { DisputeLegalGroundsService } from './dispute-legal-grounds.service';

describe('DisputeLegalGroundsService', () => {
  let service: DisputeLegalGroundsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DisputeLegalGroundsService],
    }).compile();

    service = module.get<DisputeLegalGroundsService>(DisputeLegalGroundsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
