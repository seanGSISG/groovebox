import { QueueStateDto } from '../../queue/dto/queue-state.dto';

export class RoomStateDto {
  roomId: string;
  members: Array<{ userId: string; username: string }>;
  currentDjId: string | null;
  playback: {
    playing: boolean;
    trackId: string | null;
    startAtServerTime: number | null;
    currentPosition: number | null; // for mid-song join
    serverTimestamp: number;
  };
  queueState: QueueStateDto;
}
