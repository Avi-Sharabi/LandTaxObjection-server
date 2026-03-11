import { Test, TestingModule } from '@nestjs/testing';
import { ValuationNoticesController } from './valuation-notices.controller';
import { ValuationNoticesService } from './valuation-notices.service';

describe('ValuationNoticesController', () => {
  let controller: ValuationNoticesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ValuationNoticesController],
      providers: [ValuationNoticesService],
    }).compile();

    controller = module.get<ValuationNoticesController>(ValuationNoticesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
