import { Module } from '@nestjs/common';
import { JobQueueController, JobController, JobAttemptController } from './job-queue.controller';
import { JobQueueRepository, InMemoryJobQueueRepository } from './job-queue.repository';

@Module({
  controllers: [JobQueueController, JobController, JobAttemptController],
  providers: [
    {
      provide: JobQueueRepository,
      useClass: InMemoryJobQueueRepository,
    },
  ],
  exports: [JobQueueRepository],
})
export class JobQueueModule {}
