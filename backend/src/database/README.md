# GrooveBox Database Schema

This directory contains the database configuration, entities, and migrations for the GrooveBox backend.

## Overview

The database schema is designed to support synchronized audio playback across multiple devices with democratic DJ selection through voting. It uses PostgreSQL with TypeORM for object-relational mapping.

## Tables

### users
Stores user account information.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| username | VARCHAR(50) | Unique username for login |
| display_name | VARCHAR(100) | Display name shown in app |
| password_hash | VARCHAR(255) | Bcrypt password hash (NULL for OAuth) |
| created_at | TIMESTAMPTZ | Account creation timestamp |
| last_seen | TIMESTAMPTZ | Last activity timestamp |

**Indexes:**
- `idx_username` on username (for login lookups)

### rooms
Stores room/lobby information where users gather for synchronized playback.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| room_code | VARCHAR(10) | Unique code for joining (e.g., "GROOVE123") |
| room_name | VARCHAR(100) | Display name of the room |
| password_hash | VARCHAR(255) | Optional password protection |
| owner_id | UUID | Foreign key to users (room creator) |
| settings | JSONB | Room configuration (max members, mutiny threshold, etc.) |
| created_at | TIMESTAMPTZ | Room creation timestamp |
| is_active | BOOLEAN | Whether room is still active |

**Indexes:**
- `idx_room_code` on room_code (for join lookups)
- `idx_active_rooms` on (is_active, created_at) (for listing active rooms)

**Default Settings:**
```json
{
  "maxMembers": 50,
  "mutinyThreshold": 0.51,
  "djCooldownMinutes": 5,
  "autoRandomizeDJ": false
}
```

### room_members
Tracks user memberships in rooms with synchronization metrics.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| room_id | UUID | Foreign key to rooms |
| user_id | UUID | Foreign key to users |
| role | VARCHAR(20) | 'owner', 'dj', or 'listener' |
| joined_at | TIMESTAMPTZ | When user joined room |
| last_active | TIMESTAMPTZ | Last activity in room |
| last_clock_offset_ms | INTEGER | Last measured clock offset (for debugging) |
| average_rtt_ms | INTEGER | Average round-trip time (for sync quality) |

**Indexes:**
- `idx_room_members` on (room_id, last_active) (for listing active members)
- `idx_user_rooms` on (user_id, joined_at) (for user's room list)

**Constraints:**
- Unique constraint on (room_id, user_id) - user can't join room twice

### room_dj_history
Historical record of DJ assignments for analytics and cooldown enforcement.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| room_id | UUID | Foreign key to rooms |
| user_id | UUID | Foreign key to users |
| became_dj_at | TIMESTAMPTZ | When user became DJ |
| removed_at | TIMESTAMPTZ | When DJ was removed (NULL if current) |
| removal_reason | VARCHAR(50) | 'mutiny', 'voluntary', 'disconnect', 'vote' |

**Indexes:**
- `idx_room_current_dj` on (room_id, removed_at) (for finding current DJ)
- `idx_dj_history` on (room_id, became_dj_at DESC) (for history view)

### votes
Stores votes for DJ elections and mutiny attempts.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| room_id | UUID | Foreign key to rooms |
| voter_id | UUID | Foreign key to users (who voted) |
| vote_type | VARCHAR(20) | 'dj_election' or 'mutiny' |
| target_user_id | UUID | Foreign key to users (NULL for mutiny) |
| created_at | TIMESTAMPTZ | When vote was cast |
| vote_session_id | UUID | Groups votes for same election |
| is_active | BOOLEAN | Whether vote is still valid |

**Indexes:**
- `idx_active_votes` on (room_id, vote_session_id, is_active) (for counting votes)

**Constraints:**
- Unique constraint on (room_id, voter_id, vote_session_id) - one vote per session

## Entity Relationships

```
User
  ├── ownedRooms (1:N) → Room
  ├── roomMemberships (1:N) → RoomMember
  ├── votes (1:N) → Vote
  ├── receivedVotes (1:N) → Vote
  └── djHistory (1:N) → RoomDjHistory

Room
  ├── owner (N:1) → User
  ├── members (1:N) → RoomMember
  ├── votes (1:N) → Vote
  └── djHistory (1:N) → RoomDjHistory

RoomMember
  ├── room (N:1) → Room
  └── user (N:1) → User

Vote
  ├── room (N:1) → Room
  ├── voter (N:1) → User
  └── targetUser (N:1) → User (nullable)

RoomDjHistory
  ├── room (N:1) → Room
  └── user (N:1) → User
```

## Configuration

Database connection is configured using environment variables:

```env
DATABASE_URL=postgresql://username:password@host:port/database
```

The configuration automatically:
- Enables synchronization in development mode (auto-creates tables)
- Enables logging in development mode
- Configures SSL for production environments
- Sets up connection pooling (max 20 connections)

## Usage

### Importing Entities

```typescript
import { User, Room, RoomMember, Vote, RoomDjHistory } from './entities';
```

### Using TypeORM Repository

```typescript
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }
}
```

### Querying with Relations

```typescript
// Get room with all members
const room = await roomsRepository.findOne({
  where: { roomCode: 'GROOVE123' },
  relations: ['members', 'members.user'],
});

// Get current DJ for a room
const currentDj = await djHistoryRepository.findOne({
  where: { roomId, removedAt: IsNull() },
  relations: ['user'],
});
```

## Migrations

### Running Migrations

```bash
# Run all pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Creating New Migrations

```bash
# Generate migration from entity changes
npm run migration:generate -- -n MigrationName

# Create empty migration
npm run migration:create -- -n MigrationName
```

## Development vs Production

**Development Mode:**
- `synchronize: true` - Auto-creates/updates tables based on entities
- `logging: true` - Logs all SQL queries
- No SSL required

**Production Mode:**
- `synchronize: false` - Use migrations only (safer)
- `logging: false` - Disable query logging (performance)
- SSL enabled for secure connections

## Schema Design Decisions

1. **UUID Primary Keys**: Better for distributed systems, harder to guess, no auto-increment race conditions

2. **JSONB Settings**: Flexible room configuration without schema changes. Indexed for query performance.

3. **Sync Metrics in room_members**: Storing clock offset and RTT helps debug sync issues and can be used for adaptive sync buffering.

4. **Soft Deletes via is_active**: Rooms marked inactive instead of deleted, preserving history.

5. **Composite Indexes**: Multi-column indexes on common query patterns (e.g., finding current DJ, listing active members).

6. **Cascading Deletes**: When room deleted, all members, votes, and DJ history automatically cleaned up.

7. **Nullable Timestamps**: `removed_at` being NULL indicates "current DJ" - simpler than separate boolean flag.

## Performance Considerations

- All foreign key columns are indexed automatically by PostgreSQL
- Additional indexes on common query patterns (username, room_code, etc.)
- Connection pooling prevents connection exhaustion
- JSONB settings allow flexible config without JOIN overhead

## Security Notes

- Password hashes stored using bcrypt (handled in application layer)
- Room passwords also bcrypt-hashed
- No sensitive data in logs (password_hash excluded from logging)
- Prepared statements via TypeORM prevent SQL injection

## Future Enhancements

Potential schema additions for future phases:

1. **chat_messages table**: Store persistent chat history
2. **playback_events table**: Analytics on what tracks are played
3. **user_sessions table**: Track active WebSocket sessions
4. **spotify_tokens table**: Store encrypted Spotify OAuth tokens
5. **room_invites table**: Shareable room invitation links
