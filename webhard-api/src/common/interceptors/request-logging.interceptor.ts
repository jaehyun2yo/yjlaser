import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import {
  redactErrorMessage,
  redactRequestUrl,
  safePrincipalLabel,
} from '../logging/request-redaction';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method } = request;
    const url = redactRequestUrl(String(request.url ?? ''));
    const principal = safePrincipalLabel(request.user);
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.log(`${method} ${url} | principal=${principal} | ${duration}ms`);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.warn(
          `${method} ${url} | principal=${principal} | ${duration}ms | error=${redactErrorMessage(error.message)}`
        );
        throw error;
      })
    );
  }
}
