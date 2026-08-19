import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Infrastructure services: notifications, circuit breaker, distributed lock, job logging.
 */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class InfraCoreModule {}
