import { describe, it, expect } from 'vitest';
import { getSceneSourceStartFrame } from '../utils/sceneSourceStart';

describe('getSceneSourceStartFrame', () => {
  it('own-clip scene at timeline 10s with trim 0 starts at clip frame 0, not 300', () => {
    expect(getSceneSourceStartFrame({ startTime: 10, originalStartTime: 10, mediaSourceStart: 0 }, 30, true)).toBe(0);
  });
  it('own-clip scene honours a non-zero trim in', () => {
    expect(getSceneSourceStartFrame({ startTime: 25, originalStartTime: 25, mediaSourceStart: 1.5 }, 30, true)).toBe(45);
  });
  it('all six campaign scenes start inside their 5s clips', () => {
    for (let i = 0; i < 6; i++) {
      const f = getSceneSourceStartFrame({ startTime: i * 5, originalStartTime: i * 5, mediaSourceStart: 0 }, 30, true);
      expect(f).toBeLessThan(150);
    }
  });
  it('original-upload scene keeps its original position', () => {
    expect(getSceneSourceStartFrame({ startTime: 4, originalStartTime: 12 }, 30, false)).toBe(360);
  });
});
