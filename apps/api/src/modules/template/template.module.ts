import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateRepository, InMemoryTemplateRepository } from './template.repository';

@Module({
  controllers: [TemplateController],
  providers: [{ provide: TemplateRepository, useClass: InMemoryTemplateRepository }],
  exports: [TemplateRepository],
})
export class TemplateModule {}
