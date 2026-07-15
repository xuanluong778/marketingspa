import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { captureException } from '../../sentry';

function isInfrastructureError(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  const msg = exception.message.toLowerCase();
  const name = exception.name.toLowerCase();
  return (
    name.includes('prismaclientinitialization') ||
    name.includes('prismaclientknownrequest') ||
    msg.includes("can't reach database server") ||
    msg.includes('cannot reach database server') ||
    msg.includes('database server is not reachable') ||
    msg.includes('econnrefused') ||
    msg.includes('connection refused') ||
    msg.includes('timed out fetching a new connection from the connection pool') ||
    msg.includes('server has closed the connection') ||
    msg.includes('p1001') ||
    msg.includes('p1002') ||
    msg.includes('p1017')
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        if (Array.isArray(obj.message)) {
          errors = obj.message as string[];
          message = 'Validation failed';
        }
      }
    } else if (isInfrastructureError(exception)) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message =
        'Không kết nối được database. Chạy `pnpm dev:infra` (Docker Postgres/Redis) rồi thử lại.';
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
      captureException(exception, 'GlobalExceptionFilter');
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      captureException(exception, 'GlobalExceptionFilter');
    } else {
      this.logger.error('Unknown exception', String(exception));
      captureException(exception, 'GlobalExceptionFilter');
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
