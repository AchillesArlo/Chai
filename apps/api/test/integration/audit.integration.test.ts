import { describe, expect, it } from 'vitest';

import { deriveActionFromHttpMethod } from '@chai/domain';

describe('Audit Trail Integration', () => {
  describe('deriveActionFromHttpMethod', () => {
    it('should derive created action for POST', () => {
      expect(deriveActionFromHttpMethod('POST', 'lead')).toBe('lead.created');
    });

    it('should derive updated action for PUT', () => {
      expect(deriveActionFromHttpMethod('PUT', 'lead')).toBe('lead.updated');
    });

    it('should derive updated action for PATCH', () => {
      expect(deriveActionFromHttpMethod('PATCH', 'lead')).toBe('lead.updated');
    });

    it('should derive deleted action for DELETE', () => {
      expect(deriveActionFromHttpMethod('DELETE', 'lead')).toBe('lead.deleted');
    });

    it('should derive unknown action for GET', () => {
      expect(deriveActionFromHttpMethod('GET', 'lead')).toBe('lead.accessed');
    });
  });
});
