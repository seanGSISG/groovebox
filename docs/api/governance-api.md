# Governance API Documentation

This document describes the WebSocket events for GrooveBox's democratic governance system, including DJ elections, mutiny votes, and random DJ selection.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [DJ Election Events](#dj-election-events)
- [Mutiny Events](#mutiny-events)
- [Random DJ Events](#random-dj-events)
- [Common Patterns](#common-patterns)
- [Error Handling](#error-handling)
- [Example Flows](#example-flows)

## Overview

The governance system uses WebSocket events to enable real-time democratic voting for DJ selection and management. All governance events require authentication and room membership.

### Vote Types

- **DJ Election** (`dj_election`): Vote to select a new DJ from room members
- **Mutiny** (`mutiny`): Vote to remove the current DJ

### Key Concepts

- **Vote Session**: A unique voting instance with a session ID that expires after 5 minutes
- **Concurrent Vote Prevention**: Only one vote can be active per room at a time
- **Auto-completion**: Votes complete automatically when all members have voted or outcome is mathematically guaranteed
- **Cooldowns**: Prevent vote spam and ensure fair rotation

## Authentication

All WebSocket connections must be authenticated with a JWT token:

```javascript
const socket = io('http://your-server-url', {
  auth: {
    token: 'your-jwt-token-here'
  }
});
```

## DJ Election Events

### Start DJ Election

Initiates a new DJ election vote where members can vote for their preferred DJ candidate.

**Event:** `vote:start-election`

**Payload:**
```typescript
roomCode: string
```

**Example:**
```javascript
socket.emit('vote:start-election', 'ABC123');
```

**Response Event:** `vote:election-started`

**Response Payload:**
```typescript
{
  voteSessionId: string;      // Unique vote session identifier
  voteType: 'dj_election';    // Vote type
  isComplete: false;          // Vote status
  totalVoters: number;        // Number of eligible voters
  voteCounts: {};             // Vote counts per candidate (empty at start)
  initiatorId: string;        // User who started the election
}
```

**Errors:**
- `Room not found` - Invalid room code
- `You are not a member of this room` - User is not a room member
- `Another vote is already in progress in this room` - Concurrent vote prevention

---

### Cast DJ Vote

Cast a vote for a DJ candidate during an active election.

**Event:** `vote:cast-dj`

**Payload:**
```typescript
{
  voteSessionId: string;  // From election-started event
  targetUserId: string;   // UUID of the candidate to vote for
}
```

**Example:**
```javascript
socket.emit('vote:cast-dj', {
  voteSessionId: '550e8400-e29b-41d4-a716-446655440000',
  targetUserId: '123e4567-e89b-12d3-a456-426614174000'
});
```

**Response Event:** `vote:results-updated`

**Response Payload:**
```typescript
{
  voteSessionId: string;
  voteType: 'dj_election';
  isComplete: boolean;
  totalVoters: number;
  voteCounts: {
    [userId: string]: number;  // Number of votes per candidate
  };
}
```

**Completion Events:**

When all votes are cast, the following events are broadcast:

1. **`vote:complete`**
```typescript
{
  voteSessionId: string;
  voteType: 'dj_election';
  isComplete: true;
  totalVoters: number;
  voteCounts: {
    [userId: string]: number;
  };
  winner: string;  // UUID of winning candidate
}
```

2. **`dj:changed`**
```typescript
{
  newDjId: string;      // UUID of new DJ
  username: string;     // Username of new DJ
  displayName: string;  // Display name of new DJ
  reason: 'vote';       // Reason for DJ change
}
```

**Errors:**
- `Vote session not found or expired` - Invalid or expired session ID
- `You have already voted in this session` - Duplicate vote attempt
- `Target user ID is required for DJ election` - Missing targetUserId

---

## Mutiny Events

### Start Mutiny

Initiates a mutiny vote to remove the current DJ.

**Event:** `vote:start-mutiny`

**Payload:**
```typescript
roomCode: string
```

**Example:**
```javascript
socket.emit('vote:start-mutiny', 'ABC123');
```

**Response Event:** `vote:mutiny-started`

**Response Payload:**
```typescript
{
  voteSessionId: string;
  voteType: 'mutiny';
  isComplete: false;
  totalVoters: number;
  mutinyVotes: {
    yes: 0,
    no: 0
  };
  threshold: number;      // e.g., 0.51 for 51% majority
  initiatorId: string;
  targetDjId: string;     // DJ being voted against
}
```

**Errors:**
- `Room not found` - Invalid room code
- `You are not a member of this room` - User is not a room member
- `No DJ to mutiny against` - No current DJ in room
- `Another vote is already in progress in this room` - Concurrent vote prevention
- `Mutiny is on cooldown. Please wait before starting another.` - Mutiny attempted during cooldown period

---

### Cast Mutiny Vote

Cast a yes/no vote in an active mutiny.

**Event:** `vote:cast-mutiny`

**Payload:**
```typescript
{
  voteSessionId: string;
  voteValue: boolean;  // true = yes (remove DJ), false = no (keep DJ)
}
```

**Example:**
```javascript
socket.emit('vote:cast-mutiny', {
  voteSessionId: '550e8400-e29b-41d4-a716-446655440000',
  voteValue: true  // Vote to remove DJ
});
```

**Response Event:** `vote:results-updated`

**Response Payload:**
```typescript
{
  voteSessionId: string;
  voteType: 'mutiny';
  isComplete: boolean;
  totalVoters: number;
  mutinyVotes: {
    yes: number;
    no: number;
  };
  threshold: number;
}
```

**Completion Events:**

When vote completes, one of the following events is broadcast:

**Mutiny Success:**

1. **`vote:complete`**
```typescript
{
  voteSessionId: string;
  voteType: 'mutiny';
  isComplete: true;
  totalVoters: number;
  mutinyVotes: { yes: number; no: number };
  threshold: number;
  mutinyPassed: true;
}
```

2. **`mutiny:success`**
```typescript
{
  removedDjId: string;  // UUID of removed DJ
}
```

**Mutiny Failed:**

1. **`vote:complete`** (with `mutinyPassed: false`)

2. **`mutiny:failed`**
```typescript
{
  voteSessionId: string;
}
```

**Smart Completion:**

The mutiny vote can complete early if the outcome is mathematically guaranteed:
- **Guaranteed Pass**: Even if all remaining voters vote NO, yes percentage still >= threshold
- **Guaranteed Fail**: Even if all remaining voters vote YES, yes percentage still < threshold

**Errors:**
- `Vote session not found or expired` - Invalid or expired session ID
- `You have already voted in this session` - Duplicate vote attempt
- `Vote value (yes/no) is required for mutiny` - Missing voteValue

**Cooldowns:**

After a successful mutiny:
- **Mutiny Cooldown**: 10 minutes before another mutiny can be started
- **DJ Cooldown**: Removed DJ cannot become DJ again for a configurable period (default: 5 minutes)

---

## Random DJ Events

### Randomize DJ

Room owners can randomly select any member to be DJ without voting.

**Event:** `dj:randomize`

**Payload:**
```typescript
roomCode: string
```

**Example:**
```javascript
socket.emit('dj:randomize', 'ABC123');
```

**Response Event:** `dj:changed`

**Response Payload:**
```typescript
{
  newDjId: string;      // UUID of randomly selected DJ
  username: string;     // Username of new DJ
  displayName: string;  // Display name of new DJ
  reason: 'randomize';  // Reason for DJ change
}
```

**Errors:**
- `Room not found` - Invalid room code
- `Only room owner can randomize DJ` - User is not the room owner

**Behavior:**
- If there's an existing DJ, they are removed (with reason `voluntary`)
- Random selection has equal probability for all room members
- No cooldown or voting required

---

## Common Patterns

### Vote Lifecycle

1. **Initiation**: User emits `vote:start-election` or `vote:start-mutiny`
2. **Started**: All room members receive `vote:*-started` event
3. **Voting**: Members emit `vote:cast-dj` or `vote:cast-mutiny`
4. **Updates**: All members receive `vote:results-updated` after each vote
5. **Completion**: All members receive `vote:complete` when finished
6. **Action**: Relevant action taken (DJ change, mutiny success/fail)

### Vote Expiration

All votes automatically expire after 5 minutes:
- Vote session data is deleted from Redis
- No further votes can be cast
- Active vote lock is released
- No completion events are broadcast

### Real-time Updates

All room members receive real-time updates during voting:
- Vote counts update immediately after each vote
- Progress toward completion is visible
- Early completion triggers when outcome is guaranteed

---

## Error Handling

### Error Event

All WebSocket errors are emitted via the `exception` event:

```javascript
socket.on('exception', (error) => {
  console.error('WebSocket error:', error.message);
});
```

**Error Payload:**
```typescript
{
  message: string;  // Human-readable error message
  status?: string;  // Optional status code
}
```

### Common Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| `Room not found` | Invalid room code | Verify room code is correct |
| `You are not a member of this room` | User not in room | Join room first |
| `Another vote is already in progress` | Concurrent vote attempt | Wait for current vote to complete |
| `Vote session not found or expired` | Invalid/expired session ID | Start a new vote |
| `You have already voted` | Duplicate vote attempt | Each user can only vote once |
| `Mutiny is on cooldown` | Too soon after last mutiny | Wait for cooldown to expire |
| `No DJ to mutiny against` | Mutiny with no current DJ | Cannot mutiny without a DJ |
| `Only room owner can randomize DJ` | Non-owner randomize attempt | Only owner has this privilege |

---

## Example Flows

### Example 1: Complete DJ Election

```javascript
// User 1 starts election
socket.emit('vote:start-election', 'ABC123');

// All users receive election started event
socket.on('vote:election-started', (data) => {
  console.log('Election started:', data.voteSessionId);
  console.log('Total voters:', data.totalVoters);
});

// Users cast votes
socket.emit('vote:cast-dj', {
  voteSessionId: data.voteSessionId,
  targetUserId: 'user-2-uuid'
});

// All users receive vote updates
socket.on('vote:results-updated', (results) => {
  console.log('Current vote counts:', results.voteCounts);
});

// When complete
socket.on('vote:complete', (final) => {
  console.log('Winner:', final.winner);
});

socket.on('dj:changed', (change) => {
  console.log('New DJ:', change.displayName);
});
```

### Example 2: Successful Mutiny

```javascript
// Start mutiny
socket.emit('vote:start-mutiny', 'ABC123');

socket.on('vote:mutiny-started', (data) => {
  console.log('Mutiny against DJ:', data.targetDjId);
  console.log('Threshold:', data.threshold * 100 + '%');
});

// Cast yes vote
socket.emit('vote:cast-mutiny', {
  voteSessionId: data.voteSessionId,
  voteValue: true
});

// Track progress
socket.on('vote:results-updated', (results) => {
  const yesPercent = results.mutinyVotes.yes / results.totalVoters;
  console.log('Yes votes:', yesPercent * 100 + '%');
});

// Mutiny succeeds
socket.on('mutiny:success', (result) => {
  console.log('DJ removed:', result.removedDjId);
});
```

### Example 3: Failed Mutiny

```javascript
socket.emit('vote:start-mutiny', 'ABC123');

socket.on('vote:mutiny-started', (data) => {
  // ... voting happens ...
});

// Mutiny fails
socket.on('mutiny:failed', (result) => {
  console.log('Mutiny failed, DJ retained');
});

socket.on('vote:complete', (final) => {
  console.log('Final vote:', final.mutinyVotes);
  console.log('Passed:', final.mutinyPassed); // false
});
```

### Example 4: Random DJ Selection

```javascript
// Only room owner can do this
socket.emit('dj:randomize', 'ABC123');

socket.on('dj:changed', (change) => {
  console.log('Random DJ selected:', change.displayName);
  console.log('Reason:', change.reason); // 'randomize'
});
```

### Example 5: Error Handling

```javascript
// Listen for errors
socket.on('exception', (error) => {
  if (error.message.includes('already in progress')) {
    console.log('Wait for current vote to finish');
  } else if (error.message.includes('already voted')) {
    console.log('You already cast your vote');
  } else if (error.message.includes('cooldown')) {
    console.log('Please wait before starting another vote');
  } else {
    console.error('Error:', error.message);
  }
});

// Try to start election
socket.emit('vote:start-election', 'ABC123');
```

---

## Rate Limiting & Cooldowns

### Mutiny Cooldown
- **Duration**: 10 minutes (600 seconds)
- **Scope**: Per room
- **Trigger**: When mutiny vote is started
- **Purpose**: Prevent vote spam

### DJ Cooldown
- **Duration**: Configurable per room (default: 5 minutes / 300 seconds)
- **Scope**: Per DJ per room
- **Trigger**: When DJ is removed via mutiny
- **Purpose**: Ensure fair rotation, prevent immediate re-election

### Vote Expiration
- **Duration**: 5 minutes (300 seconds)
- **Scope**: Per vote session
- **Trigger**: When vote starts
- **Purpose**: Prevent stale votes from blocking new votes

### Concurrent Vote Prevention
- **Mechanism**: Redis-based active vote lock per room
- **Duration**: Until vote completes or expires
- **Purpose**: Ensure only one vote type active at a time

---

## Technical Details

### Storage

- **Vote Sessions**: Stored in Redis with TTL of 300 seconds
  - Key: `vote:{voteSessionId}`
  - Data: Hash containing vote metadata and individual votes

- **Active Vote Lock**: Redis key per room
  - Key: `room:{roomId}:active_vote`
  - Value: Current vote session ID
  - TTL: 300 seconds

- **Cooldowns**: Redis keys with TTL
  - Mutiny: `room:{roomId}:mutiny_cooldown`
  - DJ: `room:{roomId}:dj_cooldown:{userId}`

- **Vote History**: Stored in PostgreSQL `votes` table for analytics

### Tie-Breaking Logic

In DJ elections, if multiple candidates receive the same number of votes:
1. The system checks when each tied candidate received their **first vote**
2. The candidate who received votes **earliest** wins
3. Timestamps are stored in Redis when the first vote is cast for each candidate
4. This ensures deterministic outcomes without requiring additional votes

### Mutiny Threshold Calculation

```typescript
const totalVotes = yesVotes + noVotes;
const yesPercentage = yesVotes / totalVoters;  // Based on total eligible voters
const mutinyPassed = yesPercentage >= threshold;  // Default threshold: 0.51
```

Note: Percentage is calculated based on **total eligible voters**, not just those who voted.

---

## Security Considerations

1. **Authentication Required**: All governance events require valid JWT token
2. **Authorization Checks**:
   - Room membership verified for all actions
   - Room ownership verified for `dj:randomize`
3. **Validation**: All payloads validated using class-validator DTOs
4. **Rate Limiting**: Cooldowns prevent abuse
5. **Concurrent Protection**: Only one vote active per room at a time
6. **Expiration**: Votes auto-expire to prevent resource exhaustion

---

## Testing

See [Testing Guide](../testing-guide.md) for information on:
- Running governance integration tests
- Manual testing scenarios
- WebSocket testing with Socket.io client

---

## Changelog

### Phase 3 (2025-11-23)
- Initial implementation of governance system
- DJ elections with tie-breaking
- Mutiny voting with smart completion
- Random DJ selection
- Cooldown system
- Comprehensive error handling
