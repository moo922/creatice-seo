import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JobProgressTracker } from './job-progress';

/**
 * Infrastructure services: notifications, job progress tracking.
 * Circuit breaker, distributed lock, and job logger are used directly (not NestJS-managed).
 * Observability and missed schedule recovery are worker-specific (apps/worker).
 */
@Global()
@Module({
  providers: [NotificationService, JobProgressTracker],
  exports: [NotificationService, JobProgressTracker],
})
export class InfraCoreModule {}
