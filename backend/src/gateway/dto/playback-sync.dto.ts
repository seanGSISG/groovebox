export class PlaybackSyncDto {
  roomId: string;
  serverTimestamp: number;
  theoreticalPosition: number; // ms
  trackId: string;
}
