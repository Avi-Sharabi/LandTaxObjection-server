import { Test, TestingModule } from '@nestjs/testing';
import { ValuationNoticesService } from './valuation-notices.service';

describe('ValuationNoticesService', () => {
  let service: ValuationNoticesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ValuationNoticesService],
    }).compile();

    service = module.get<ValuationNoticesService>(ValuationNoticesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
