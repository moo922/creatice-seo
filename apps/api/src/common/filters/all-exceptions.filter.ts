import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response.status(status).json(normalizeHttpPayload(payload, request));
      return;
    }

    this.logger.error(`Unhandled exception: ${String(exception)}`, exception instanceof Error ? exception.stack : undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      path: request.path,
      timestamp: new Date().toISOString(),
    });
  }
}

function normalizeHttpPayload(payload: string | object, request: Request): object {
  const body =
    typeof payload === 'string'
      ? { message: payload }
      : (payload as Record<string, unknown>);
  return {
    statusCode: body.statusCode ?? 400,
    error: typeof body.error === 'string' ? body.error : 'Error',
    message: body.message ?? body.error ?? 'Request failed',
    path: request.path,
    timestamp: new Date().toISOString(),
  };
}
