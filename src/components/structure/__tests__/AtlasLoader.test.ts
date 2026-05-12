import { describe, it, expect } from 'vitest';
import { stageOf } from '../AtlasLoader';

describe('stageOf', () => {
  it('maps loading to stage 1', () => {
    expect(stageOf('loading')).toBe(1);
  });

  it('maps extraction stages to their numbers', () => {
    expect(stageOf('extracting:stage1')).toBe(1);
    expect(stageOf('extracting:stage2')).toBe(2);
    expect(stageOf('extracting:stage3')).toBe(3);
  });

  it('maps phase_a_ready to stage 3 (waiting on transactions)', () => {
    expect(stageOf('phase_a_ready')).toBe(3);
  });

  it('maps extracting:refining to stage 2 (refining entities/ownership)', () => {
    expect(stageOf('extracting:refining')).toBe(2);
  });

  it('maps terminal states to stage 4', () => {
    expect(stageOf('draft_ready')).toBe(4);
    expect(stageOf('user_edited')).toBe(4);
    expect(stageOf('finalized')).toBe(4);
  });

  it('maps extraction_failed to 0', () => {
    expect(stageOf('extraction_failed')).toBe(0);
  });
});
