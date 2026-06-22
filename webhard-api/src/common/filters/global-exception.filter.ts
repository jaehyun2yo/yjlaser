import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : getNonHttpExceptionStatus(exception);

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : getNonHttpExceptionResponse(status);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception)
      );
    }

    const errorMessage =
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message
          : (message as Record<string, unknown>)?.message || 'Internal server error';

    // HttpException payload 가 object 인 경우 `code` 등 추가 필드를 보존한다.
    // 예: UnprocessableEntityException({ code: 'INQUIRY_NUMBER_REQUIRED', message, contactId })
    // → 프론트엔드가 code 기반으로 사용자 친화 메시지 매핑 (stage-transition-errors.ts).
    // statusCode/message/timestamp/path 는 filter 가 직접 세팅하므로 제외.
    const extraFields: Record<string, unknown> = {};
    if (typeof message === 'object' && message !== null && !Array.isArray(message)) {
      for (const [key, value] of Object.entries(message as Record<string, unknown>)) {
        if (key === 'statusCode' || key === 'message' || key === 'timestamp' || key === 'path') {
          continue;
        }
        extraFields[key] = value;
      }
    }

    response.status(status).json({
      statusCode: status,
      message: errorMessage,
      ...extraFields,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

function getNonHttpExceptionStatus(exception: unknown): HttpStatus {
  if (typeof exception !== 'object' || exception === null) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  const status =
    (exception as { status?: unknown }).status ??
    (exception as { statusCode?: unknown }).statusCode;

  if (typeof status === 'number' && status >= 400 && status < 600) {
    return status;
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function getNonHttpExceptionResponse(status: HttpStatus): string | Record<string, string> {
  if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
    return {
      code: 'REQUEST_ENTITY_TOO_LARGE',
      message: 'REQUEST_ENTITY_TOO_LARGE',
    };
  }

  return 'Internal server error';
}
