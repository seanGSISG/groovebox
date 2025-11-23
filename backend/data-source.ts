import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User } from './src/entities/user.entity';
import { Room } from './src/entities/room.entity';
import { RoomMember } from './src/entities/room-member.entity';
import { Vote } from './src/entities/vote.entity';
import { RoomDjHistory } from './src/entities/room-dj-history.entity';
import { Message } from './src/entities/message.entity';
import { SongSubmission } from './src/entities/song-submission.entity';
import { SongSubmissionVote } from './src/entities/song-submission-vote.entity';

// Load environment variables
config();

// Get database URL from environment or use default
const databaseUrl = process.env.DATABASE_URL || 'postgresql://groovebox:groovebox_dev_password@localhost:5432/groovebox';

// Parse the DATABASE_URL
const url = new URL(databaseUrl);

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: url.hostname,
  port: parseInt(url.port, 10) || 5432,
  username: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  entities: [User, Room, RoomMember, Vote, RoomDjHistory, Message, SongSubmission, SongSubmissionVote],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // Never use synchronize with migrations
  logging: process.env.NODE_ENV === 'development',
});
