import { Global, Module } from '@nestjs/common';
import { WorkerConfig } from './worker-config';

/** Global provider for the worker environment, resolvable by dynamic modules (e.g. TypeORM). */
@Global()
@Module({
  providers: [WorkerConfig],
  exports: [WorkerConfig],
})
export class WorkerConfigModule {}
