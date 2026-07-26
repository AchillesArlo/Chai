import { Module } from '@nestjs/common';

import { createMockCalendarAdapter } from '@chai/connectors/mock-calendar';

import {
  CALENDAR_ADAPTER,
  CalendarController,
} from './calendar.controller';

@Module({
  controllers: [CalendarController],
  providers: [
    // ponytail: one process-local adapter; swap for a provider-backed service later.
    { provide: CALENDAR_ADAPTER, useValue: createMockCalendarAdapter() },
  ],
})
// NestJS discovers module metadata from this decorated class.
export class CalendarModule {}
