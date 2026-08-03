import { describe, expect, it } from 'vitest';
import { evaluateGroundedAnswerPolicy } from '../src/ai-policy/grounded-answer-policy';

describe('evaluateGroundedAnswerPolicy (REQ-08-018)', () => {
  const tenantId = 'tenant-test-1';

  it('allows claims grounded in valid published evidence above threshold', () => {
    const result = evaluateGroundedAnswerPolicy({
      claim: 'Jam operasional klinik gigi Nusantara Dental adalah 08:00 - 20:00 WIB',
      evidence: [
        {
          documentId: 'doc-1',
          excerpt: 'Klinik buka setiap hari jam 08.00 sampai 20.00 WIB.',
          score: 0.85,
          status: 'PUBLISHED',
        },
      ],
      tenantId,
    });

    expect(result.action).toBe('ALLOW_CLAIM');
    expect(result.grounded).toBe(true);
    if (result.grounded) {
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.documentId).toBe('doc-1');
    }
  });

  it('rejects claims with evidence below score threshold', () => {
    const result = evaluateGroundedAnswerPolicy({
      claim: 'Klinik memberikan diskon 50% untuk pembersihan karang gigi',
      evidence: [
        {
          documentId: 'doc-unrelated',
          excerpt: 'Layanan kebersihan dan estetika gigi',
          score: 0.01,
          status: 'PUBLISHED',
        },
      ],
      minThreshold: 0.05,
      tenantId,
    });

    expect(result.action).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.grounded).toBe(false);
  });

  it('rejects claims with non-published (DRAFT/ARCHIVED) evidence', () => {
    const result = evaluateGroundedAnswerPolicy({
      claim: 'Tarif pendaftaran pasien baru gratis',
      evidence: [
        {
          documentId: 'doc-draft',
          excerpt: 'Draft promo biaya pendaftaran',
          score: 0.9,
          status: 'DRAFT',
        },
      ],
      tenantId,
    });

    expect(result.action).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.grounded).toBe(false);
  });
});
