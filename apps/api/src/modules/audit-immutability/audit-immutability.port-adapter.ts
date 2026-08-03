import { Injectable } from '@nestjs/common';

import { AuditPort, type AuditEntryInput } from '../shared/audit.port';
import { AuditImmutabilityRepository } from './audit-immutability.repository';

/**
 * Adapter: AuditPort -> AuditImmutabilityRepository. Menjaga batas modul
 * (02 §5): modul luar depend pada AuditPort, bukan langsung repository.
 */
@Injectable()
export class AuditImmutabilityPortAdapter implements AuditPort {
  constructor(private readonly repo: AuditImmutabilityRepository) {}

  async append(entry: AuditEntryInput): Promise<void> {
    await this.repo.createEntry(entry);
  }
}
