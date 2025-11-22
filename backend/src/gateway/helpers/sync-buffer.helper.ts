export class SyncBufferHelper {
  static readonly DEFAULT_BUFFER_MS = 100;
  static readonly RTT_MULTIPLIER = 2;
  static readonly MAX_BUFFER_MS = 500;

  static calculateSyncBuffer(maxRtt: number): number {
    const buffer = Math.max(
      this.DEFAULT_BUFFER_MS,
      maxRtt * this.RTT_MULTIPLIER
    );
    return Math.min(buffer, this.MAX_BUFFER_MS);
  }
}
