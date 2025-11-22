import { RoomMemberRole } from '../../entities/room-member.entity';

export class RoomMemberDto {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: RoomMemberRole;
  joinedAt: Date;
  lastActive: Date;
}
