export class DomainException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly title?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
