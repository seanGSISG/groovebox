# DJ Election and Mutiny System

## Overview

The groovebox democratic governance system allows room members to vote on DJ changes through elections and mutiny votes. This ensures the music control stays democratic and responsive to the room's preferences.

## Features

- **DJ Election**: Vote to elect a new DJ from room members
- **Mutiny Vote**: Vote to remove the current DJ
- **Real-Time Voting**: Live vote count updates via WebSocket
- **Threshold-Based**: Configurable vote threshold (default 51%)
- **DJ Cooldown**: Prevents rapid DJ changes (default 5 minutes)
- **Owner Protection**: Room owner cannot be removed via mutiny

## Vote Types

### DJ Election

- **Purpose**: Elect a new room member as DJ
- **Requirements**:
  - Target must be a room member
  - Target cannot already be DJ
  - Target must not be in cooldown period
- **Outcome**: New DJ gains playback control

### Mutiny

- **Purpose**: Remove the current DJ
- **Requirements**:
  - Must have an active DJ
  - DJ cannot be the room owner
- **Outcome**: DJ removed, no replacement

## Vote Flow

1. **Initiation**: Any room member can start a vote
2. **Voting**: All room members can vote FOR or AGAINST
3. **Threshold**: Vote passes when FOR votes reach required threshold
4. **Auto-Complete**: Vote ends when:
   - Required votes reached (passes)
   - All members voted without reaching threshold (fails)
   - Mathematically impossible to pass (fails)
5. **Execution**: DJ change happens automatically on pass

## Configuration

Room settings control voting behavior:

```typescript
{
  mutinyThreshold: 0.51,    // 51% of members required
  djCooldownMinutes: 5,     // 5 minute cooldown after DJ removal
}
```

## WebSocket Events

**Client → Server:**
- `vote:start` - Initiate a vote (DJ election or mutiny)
- `vote:cast` - Cast a vote (for or against)
- `vote:get` - Get current active vote state

**Server → Client:**
- `vote:started` - Vote initiated, broadcast to all
- `vote:updated` - Vote count changed
- `vote:passed` - Vote succeeded
- `vote:failed` - Vote failed
- `dj:changed` - DJ changed (with new DJ ID)

## Usage

### Starting a DJ Election

1. Tap "Start Vote" in room
2. Select "Elect DJ"
3. Choose target member
4. Vote begins automatically

### Starting a Mutiny

1. Tap "Start Vote" in room
2. Select "Mutiny"
3. Vote begins automatically

### Casting a Vote

1. View active vote card
2. Tap "Vote For" or "Vote Against"
3. Confirm your choice
4. Vote recorded and broadcast

## Rate Limits

- **One vote at a time**: Only one active vote per room
- **One vote per member**: Each member can vote once per session
- **DJ cooldown**: 5 minutes before same user can be DJ again (configurable)

## Future Enhancements

- **Vote duration limits**: Auto-fail votes after timeout
- **Veto power**: Owner can cancel votes
- **Vote history**: Track past votes and outcomes
- **Anonymous voting**: Hide individual vote choices
- **Multi-candidate elections**: Vote among multiple candidates
