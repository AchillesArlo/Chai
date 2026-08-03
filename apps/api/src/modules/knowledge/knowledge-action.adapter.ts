import { Inject, Injectable } from '@nestjs/common';

import {
  ActionKnowledgePort,
  type ActionKnowledgeSearchResult,
} from '../shared/action-tool.port';
import { KnowledgeRepository } from './knowledge.repository';

/**
 * Implements the shared ActionKnowledgePort by delegating to this module's
 * own repository — the only place allowed to depend on KnowledgeRepository
 * directly (02 §5). Registered as the port's DI token in KnowledgeModule so
 * the actions module can inject it without importing this module's
 * repository.
 */
@Injectable()
export class KnowledgeActionAdapter extends ActionKnowledgePort {
  constructor(
    @Inject(KnowledgeRepository) private readonly repository: KnowledgeRepository,
  ) {
    super();
  }

  override async search(
    tenantId: string,
    query: string,
    knowledgeBaseIds: string[],
  ): Promise<ActionKnowledgeSearchResult[]> {
    const hits = await this.repository.retrieve(tenantId, { knowledgeBaseIds, query });
    return hits.map((hit) => ({ citation: hit.citation, score: hit.score }));
  }
}
