import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

export interface Envelope<T> {
  data: T;
}

/**
 * Normalises responses to { data } unless the controller already returns an
 * envelope with an array payload (e.g. paginated { data, meta } or a
 * { data, total } list). The check is deliberately narrow: domain objects that
 * carry their own `data` field (e.g. IssueDto.data) must still be enveloped.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (value === undefined || value === null) {
          return { data: null };
        }
        if (isArrayEnvelope(value)) {
          return value;
        }
        return { data: value };
      }),
    );
  }
}

function isArrayEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.data)) {
    return false;
  }
  return record.meta !== undefined || typeof record.total === 'number';
}
