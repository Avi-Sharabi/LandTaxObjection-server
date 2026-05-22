import { InternalServerErrorException, NotFoundException } from '@nestjs/common';

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
