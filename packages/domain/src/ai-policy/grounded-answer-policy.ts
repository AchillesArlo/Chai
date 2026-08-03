/**
 * Grounded answer policy for tenant-specific claims (REQ-08-018, 08_AI §13).
 *
 * Enforces that tenant-specific factual claims in AI responses are grounded
 * in published/ready evidence from the knowledge base or verified tool output.
 * If evidence is below the required threshold or missing, the response cannot
 * be delivered as a factual claim; the agent must qualify the response, request
 * clarification, or initiate a human handover.
 */

export interface GroundingEvidence {
  knowledgeBaseId?: string;
  documentId?: string;
  excerpt: string;
  score: number;
  status?: 'PUBLISHED' | 'READY' | 'DRAFT' | 'ARCHIVED';
}

export interface GroundedAnswerPolicyInput {
  claim: string;
  evidence: GroundingEvidence[];
  minThreshold?: number;
  tenantId: string;
}

export type GroundedAnswerPolicyResult =
  | {
      action: 'ALLOW_CLAIM';
      citations: Array<{ documentId?: string; excerpt: string; score: number }>;
      grounded: true;
      score: number;
    }
  | {
      action: 'INSUFFICIENT_EVIDENCE' | 'HANDOVER' | 'QUALIFY';
      grounded: false;
      reason: string;
      suggestedFallback: string;
    };

export const DEFAULT_GROUNDING_THRESHOLD = 0.05;

/**
 * Evaluates whether a tenant-specific response claim is grounded in valid evidence.
 */
export function evaluateGroundedAnswerPolicy(
  input: GroundedAnswerPolicyInput,
): GroundedAnswerPolicyResult {
  const threshold = input.minThreshold ?? DEFAULT_GROUNDING_THRESHOLD;

  // Filter evidence to valid score and published/ready status
  const validEvidence = input.evidence.filter((item) => {
    if (item.score < threshold) return false;
    if (item.status && item.status !== 'PUBLISHED' && item.status !== 'READY') {
      return false;
    }
    return true;
  });

  if (validEvidence.length === 0) {
    return {
      action: 'INSUFFICIENT_EVIDENCE',
      grounded: false,
      reason: `Claim '${input.claim.slice(0, 50)}...' has no supporting evidence above threshold ${threshold}`,
      suggestedFallback:
        'Maaf, saya tidak menemukan informasi terverifikasi untuk pertanyaan tersebut. Hubungkan dengan CS manusia.',
    };
  }

  const maxScore = Math.max(...validEvidence.map((e) => e.score));

  return {
    action: 'ALLOW_CLAIM',
    citations: validEvidence.map((e) => ({
      documentId: e.documentId,
      excerpt: e.excerpt,
      score: e.score,
    })),
    grounded: true,
    score: maxScore,
  };
}
