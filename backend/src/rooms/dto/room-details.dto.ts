import { RoomSettings } from '../../entities/room.entity';
import { RoomMemberDto } from './room-member.dto';

export class RoomDetailsDto {
  id: string;
  roomCode: string;
  roomName: string;
  isPasswordProtected: boolean;
  ownerId: string | null;
  settings: RoomSettings;
  createdAt: Date;
  isActive: boolean;
  memberCount?: number;
  members?: RoomMemberDto[];
}
