export interface Room {
  id: string;
  roomCode: string;
  roomName: string;
  ownerId: string;
  memberCount?: number;
  hasPassword: boolean;
}

export interface CreateRoomRequest {
  roomName: string;
  password?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  password?: string;
}
