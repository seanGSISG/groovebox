import { RoomMemberRole } from '../../entities/room-member.entity';
import { RoomSettings } from '../../entities/room.entity';

export class UserRoomDto {
  id: string;
  roomCode: string;
  roomName: string;
  isPasswordProtected: boolean;
  ownerId: string | null;
  settings: RoomSettings;
  createdAt: Date;
  isActive: boolean;
  memberCount: number;
  myRole: RoomMemberRole;
  joinedAt: Date;
}
