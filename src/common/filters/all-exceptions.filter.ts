import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Outermost global filter — the backstop for anything that is not an
 * HttpException and not a DomainException.
 *
 * Without it, Nest's BaseExceptionFilter duck-types any thrown value carrying
 * `statusCode` + `message` and forwards both to the client verbatim. Azure SDK
 * errors (RestError) carry exactly those two fields, so an upstream failure
 * would surface as a non-500 response with an Azure-authored message — leaking
 * storage account names, container paths and request IDs. This discriminates
 * nominally on `instanceof HttpException` instead, so anything unrecognised
 * becomes a generic 500 and the real error is logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Headers already sent means a stream failed mid-transfer; the status is
    // committed, so the only correct action is to log and abort the connection.
    if (response.headersSent) {
      this.logger.error(
        `Unhandled exception after response started — ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      response.destroy();
      return;
    }

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException) {
      this.logger.error(
        `Unhandled exception — ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (isHttpException) {
      response.status(statusCode).json(exception.getResponse());
      return;
    }

    response.status(statusCode).json({
      statusCode,
      message: 'Internal server error',
    });
  }
}
