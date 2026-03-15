import { BadRequestException } from '@nestjs/common';

export class ClientFyiNotLinkedException extends BadRequestException {
  constructor(clientId: string) {
    super(`Client '${clientId}' does not have a linked FYI account. Cannot accept T&C.`);
  }
}