import { describe, expect, it } from 'vitest';

import { classifyMediaJob } from '../src/index';

describe('media job classification', () => {
  it('routes by content type', () => {
    expect(classifyMediaJob('image/png')).toBe('thumbnail');
    expect(classifyMediaJob('audio/mpeg')).toBe('transcribe');
    expect(classifyMediaJob('application/pdf')).toBe('scan');
  });
});
