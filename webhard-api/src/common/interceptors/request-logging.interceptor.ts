import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const user = request.user;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.log(
          `${method} ${url} | user=${user?.userId || 'anonymous'} | type=${user?.userType || 'unknown'} | ${duration}ms`
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.warn(
          `${method} ${url} | user=${user?.userId || 'anonymous'} | type=${user?.userType || 'unknown'} | ${duration}ms | error=${error.message}`
        );
        throw error;
      })
    );
  }
}
