import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DomainException } from '../../../common/exceptions/domain.exception';

export class EplanningAddressNotFoundException extends DomainException {
  constructor(address: string) {
    super('EPLANNING_ADDRESS_NOT_FOUND', `Address not found in ePlanning API: ${address}`, 404);
  }
}

export class EplanningReportUrlException extends DomainException {
  constructor(propId: string) {
    super('EPLANNING_REPORT_URL_MISSING', `ePlanning API returned no reportUrl for propId: ${propId}`, 500);
  }
}

export class GeocodingFailedException extends InternalServerErrorException {
  constructor(address: string) {
    super(`Geocoding returned no candidates for address: ${address}`);
  }
}

export class ClaudeApiException extends InternalServerErrorException {
  constructor(label: string, reason: string) {
    super(`Claude API call failed [${label}]: ${reason}`);
  }
}

export class PdfParseException extends InternalServerErrorException {
  constructor(reason: string) {
    super(`PDF parse failed: ${reason}`);
  }
}

export class EvidenceDisputeCaseNotFoundException extends NotFoundException {
  constructor(disputeCaseId: string) {
    super(`Dispute case ${disputeCaseId} not found for evidence analysis`);
  }
}
