import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { Vote } from '../entities/vote.entity';
import { RoomDjHistory } from '../entities/room-dj-history.entity';
import { Message } from '../entities/message.entity';

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Parse the DATABASE_URL
  // Format: postgresql://username:password@host:port/database
  const url = new URL(databaseUrl);

  return {
    type: 'postgres',
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    username: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Remove leading '/'
    entities: [User, Room, RoomMember, Vote, RoomDjHistory, Message],
    synchronize: configService.get<string>('NODE_ENV') === 'development', // Only for development
    logging: configService.get<string>('NODE_ENV') === 'development',
    ssl: configService.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
    extra: {
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  };
};
