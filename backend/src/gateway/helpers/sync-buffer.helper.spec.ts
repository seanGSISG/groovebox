import { SyncBufferHelper } from './sync-buffer.helper';

describe('SyncBufferHelper', () => {
  describe('calculateSyncBuffer', () => {
    it('should return DEFAULT_BUFFER_MS when maxRtt is very low', () => {
      const maxRtt = 10; // Very low RTT
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      // RTT * 2 = 20ms, but minimum is DEFAULT_BUFFER_MS (100ms)
      expect(result).toBe(SyncBufferHelper.DEFAULT_BUFFER_MS);
    });

    it('should return DEFAULT_BUFFER_MS when maxRtt * RTT_MULTIPLIER equals DEFAULT_BUFFER_MS', () => {
      const maxRtt = 50; // 50 * 2 = 100ms
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      expect(result).toBe(SyncBufferHelper.DEFAULT_BUFFER_MS);
    });

    it('should return maxRtt * RTT_MULTIPLIER when it exceeds DEFAULT_BUFFER_MS but below MAX_BUFFER_MS', () => {
      const maxRtt = 100; // 100 * 2 = 200ms
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      expect(result).toBe(200);
    });

    it('should cap at MAX_BUFFER_MS when maxRtt * RTT_MULTIPLIER exceeds it', () => {
      const maxRtt = 300; // 300 * 2 = 600ms, but max is 500ms
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      expect(result).toBe(SyncBufferHelper.MAX_BUFFER_MS);
    });

    it('should cap at MAX_BUFFER_MS for very high RTT values', () => {
      const maxRtt = 1000; // 1000 * 2 = 2000ms, but max is 500ms
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      expect(result).toBe(SyncBufferHelper.MAX_BUFFER_MS);
    });

    it('should handle zero RTT', () => {
      const maxRtt = 0;
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      // 0 * 2 = 0, but minimum is DEFAULT_BUFFER_MS
      expect(result).toBe(SyncBufferHelper.DEFAULT_BUFFER_MS);
    });

    it('should calculate adaptive buffer for medium RTT (150ms)', () => {
      const maxRtt = 150; // 150 * 2 = 300ms
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      expect(result).toBe(300);
    });

    it('should calculate adaptive buffer for RTT at MAX threshold (250ms)', () => {
      const maxRtt = 250; // 250 * 2 = 500ms (exactly MAX_BUFFER_MS)
      const result = SyncBufferHelper.calculateSyncBuffer(maxRtt);

      expect(result).toBe(SyncBufferHelper.MAX_BUFFER_MS);
    });
  });

  describe('constants', () => {
    it('should have correct constant values', () => {
      expect(SyncBufferHelper.DEFAULT_BUFFER_MS).toBe(100);
      expect(SyncBufferHelper.RTT_MULTIPLIER).toBe(2);
      expect(SyncBufferHelper.MAX_BUFFER_MS).toBe(500);
    });
  });
});
