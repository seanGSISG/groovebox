# GrooveBox Testing Guide

Comprehensive guide for running and writing tests for the GrooveBox backend.

## Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Governance Testing](#governance-testing)
- [Manual Testing Scenarios](#manual-testing-scenarios)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)

## Overview

GrooveBox uses Jest as the testing framework with the following test coverage:
- **Unit Tests**: Test individual services, controllers, and utilities
- **Integration Tests**: Test complete flows including WebSocket communication
- **E2E Tests**: End-to-end tests simulating real user interactions

**Current Test Status**: 177+ passing tests

## Test Types

### Unit Tests (`.spec.ts`)

Located in `src/` alongside source files. Test individual components in isolation.

**Examples:**
- `src/auth/auth.service.spec.ts` - Authentication service tests
- `src/votes/votes.service.spec.ts` - Voting service tests
- `src/rooms/rooms.service.spec.ts` - Room management tests
- `src/gateway/room.gateway.spec.ts` - WebSocket gateway tests

### E2E Tests (`.e2e-spec.ts`)

Located in `test/` directory. Test complete application flows.

**Examples:**
- `test/auth.e2e-spec.ts` - Authentication endpoints
- `test/governance.e2e-spec.ts` - Governance system (DJ elections, mutiny, randomize)

## Running Tests

### All Unit Tests

```bash
npm test
```

This runs all unit tests in the `src/` directory.

**Expected Output:**
```
Test Suites: 11 passed, 11 total
Tests:       177 passed, 177 total
```

### Watch Mode

Run tests in watch mode for development:

```bash
npm run test:watch
```

### Coverage Report

Generate code coverage report:

```bash
npm run test:cov
```

Coverage report will be generated in `coverage/` directory.

### E2E Tests

**Requirements:**
- PostgreSQL database running (via Docker)
- Redis server running (via Docker)

**Start Services:**
```bash
docker-compose up -d
```

**Run E2E Tests:**
```bash
npm run test:e2e
```

**Run Specific E2E Test:**
```bash
npm run test:e2e -- governance.e2e-spec.ts
```

### Debug Mode

Run tests with Node debugger:

```bash
npm run test:debug
```

Then attach your debugger to the Node process.

## Test Structure

### Typical Unit Test Structure

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceName } from './service-name.service';

describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ServiceName],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('methodName', () => {
    it('should perform expected behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = service.methodName(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Typical E2E Test Structure

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Feature (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/endpoint (GET)', () => {
    return request(app.getHttpServer())
      .get('/endpoint')
      .expect(200)
      .expect('expected response');
  });
});
```

## Governance Testing

The governance system includes comprehensive tests for democratic DJ management.

### Governance Test File

**Location:** `test/governance.e2e-spec.ts`

**Test Coverage:**
- DJ election flow (start → vote → completion → DJ change)
- Mutiny flow (start → vote → outcome → DJ change/retention)
- Randomize DJ (owner authorization → random selection)
- Concurrent vote prevention
- Cooldown enforcement (DJ cooldown, mutiny cooldown)
- Vote expiry (5-minute timeout)
- Tie-breaking logic
- Error cases (unauthorized users, invalid states)

### Running Governance Tests

```bash
# All governance tests
npm run test:e2e -- governance.e2e-spec.ts

# Specific test suite
npm run test:e2e -- governance.e2e-spec.ts -t "DJ Election"

# Specific test case
npm run test:e2e -- governance.e2e-spec.ts -t "should complete full DJ election flow"
```

### Governance Test Scenarios

#### 1. DJ Election Tests

```typescript
describe('DJ Election', () => {
  it('should complete full DJ election flow with winner')
  it('should handle tie-breaking by selecting first voted candidate')
  it('should prevent concurrent votes')
  it('should auto-expire votes after 5 minutes')
  it('should reject duplicate votes from same user')
});
```

**What's tested:**
- ✅ Vote initiation by any member
- ✅ Vote casting for candidates
- ✅ Real-time vote count updates
- ✅ Auto-completion when all members vote
- ✅ Winner determination with tie-breaking
- ✅ DJ assignment after election
- ✅ Vote expiration after 5 minutes
- ✅ Duplicate vote prevention

#### 2. Mutiny Tests

```typescript
describe('Mutiny', () => {
  it('should complete full mutiny flow with successful removal')
  it('should handle failed mutiny when threshold not met')
  it('should enforce mutiny cooldown')
  it('should reject mutiny when no DJ exists')
  it('should complete mutiny early when outcome is guaranteed')
});
```

**What's tested:**
- ✅ Mutiny vote initiation
- ✅ Yes/No voting
- ✅ Threshold calculation (51% default)
- ✅ Smart completion (early exit when outcome guaranteed)
- ✅ DJ removal on success
- ✅ DJ retention on failure
- ✅ 10-minute mutiny cooldown
- ✅ 5-minute DJ cooldown after removal

#### 3. Random DJ Tests

```typescript
describe('Randomize DJ', () => {
  it('should select random DJ when initiated by owner')
  it('should reject randomize DJ from non-owner')
  it('should replace existing DJ when randomizing')
});
```

**What's tested:**
- ✅ Owner-only authorization
- ✅ Random selection from all members
- ✅ Existing DJ replacement
- ✅ No cooldown or voting required

#### 4. Error Cases

```typescript
describe('Error Cases', () => {
  it('should reject vote from non-member')
  it('should reject invalid vote session ID')
  it('should handle WebSocket disconnection during vote')
});
```

**What's tested:**
- ✅ Non-member vote rejection
- ✅ Invalid session ID handling
- ✅ WebSocket disconnection resilience

#### 5. Cooldown Enforcement

```typescript
describe('Cooldown Enforcement', () => {
  it('should enforce DJ cooldown after mutiny')
  it('should verify mutiny cooldown is set after mutiny attempt')
});
```

**What's tested:**
- ✅ DJ cooldown set after mutiny (5 minutes default)
- ✅ Mutiny cooldown set after start (10 minutes)
- ✅ Cooldown TTL verification

## Manual Testing Scenarios

### Prerequisites

1. **Start Backend Services:**
   ```bash
   docker-compose up -d
   npm run start:dev
   ```

2. **Create Test Users:**
   Use the registration endpoint to create multiple test users:
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "testuser1",
       "password": "password123",
       "displayName": "Test User 1"
     }'
   ```

3. **Get Auth Tokens:**
   Login to get JWT tokens for each user:
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "username": "testuser1",
       "password": "password123"
     }'
   ```

### Scenario 1: DJ Election Flow

**Steps:**

1. **Create Room** (as owner):
   ```bash
   curl -X POST http://localhost:3000/rooms \
     -H "Authorization: Bearer <owner-token>" \
     -H "Content-Type: application/json" \
     -d '{
       "roomName": "Test Room",
       "settings": {
         "mutinyThreshold": 0.51,
         "djCooldownMinutes": 5
       }
     }'
   ```

2. **Join Room** (as other users):
   ```bash
   curl -X POST http://localhost:3000/rooms/join \
     -H "Authorization: Bearer <user-token>" \
     -H "Content-Type: application/json" \
     -d '{"roomCode": "ABC123"}'
   ```

3. **Connect WebSockets** (all users):
   ```javascript
   const socket = io('http://localhost:3000', {
     auth: { token: 'your-jwt-token' }
   });

   socket.emit('room:join', { roomCode: 'ABC123' });
   ```

4. **Start Election** (any user):
   ```javascript
   socket.emit('vote:start-election', 'ABC123');

   socket.on('vote:election-started', (data) => {
     console.log('Election started:', data);
   });
   ```

5. **Cast Votes** (all users):
   ```javascript
   socket.emit('vote:cast-dj', {
     voteSessionId: 'session-id-from-started-event',
     targetUserId: 'candidate-user-id'
   });

   socket.on('vote:results-updated', (results) => {
     console.log('Current results:', results);
   });
   ```

6. **Verify Completion**:
   ```javascript
   socket.on('vote:complete', (final) => {
     console.log('Winner:', final.winner);
   });

   socket.on('dj:changed', (change) => {
     console.log('New DJ:', change.displayName);
   });
   ```

### Scenario 2: Mutiny Flow

**Steps:**

1. **Ensure DJ exists** (from previous election or manual assignment)

2. **Start Mutiny** (any user):
   ```javascript
   socket.emit('vote:start-mutiny', 'ABC123');

   socket.on('vote:mutiny-started', (data) => {
     console.log('Mutiny started against:', data.targetDjId);
     console.log('Threshold:', data.threshold);
   });
   ```

3. **Cast Votes** (all users):
   ```javascript
   socket.emit('vote:cast-mutiny', {
     voteSessionId: 'session-id',
     voteValue: true  // true = yes, false = no
   });
   ```

4. **Verify Outcome**:

   **If mutiny succeeds:**
   ```javascript
   socket.on('mutiny:success', (result) => {
     console.log('DJ removed:', result.removedDjId);
   });
   ```

   **If mutiny fails:**
   ```javascript
   socket.on('mutiny:failed', (result) => {
     console.log('Mutiny failed');
   });
   ```

5. **Test Cooldown**:
   Try to start another mutiny immediately - should fail with cooldown error.

### Scenario 3: Random DJ Selection

**Steps:**

1. **Connect as Room Owner**:
   ```javascript
   socket.emit('room:join', { roomCode: 'ABC123' });
   ```

2. **Randomize DJ**:
   ```javascript
   socket.emit('dj:randomize', 'ABC123');

   socket.on('dj:changed', (change) => {
     console.log('Random DJ:', change.displayName);
     console.log('Reason:', change.reason); // 'randomize'
   });
   ```

3. **Test Authorization**:
   Try as non-owner - should fail with permission error.

### Scenario 4: Concurrent Vote Prevention

**Steps:**

1. **Start Election** (user 1):
   ```javascript
   socket1.emit('vote:start-election', 'ABC123');
   ```

2. **Try to Start Mutiny** (user 2) while election active:
   ```javascript
   socket2.emit('vote:start-mutiny', 'ABC123');

   socket2.on('exception', (error) => {
     console.log(error.message); // "Another vote is already in progress"
   });
   ```

3. **Complete First Vote**, then start second vote successfully.

### Scenario 5: Vote Expiration

**Steps:**

1. **Start Election**:
   ```javascript
   socket.emit('vote:start-election', 'ABC123');
   ```

2. **Wait 6 minutes** (vote expires after 5 minutes)

3. **Try to Cast Vote**:
   ```javascript
   socket.emit('vote:cast-dj', {
     voteSessionId: 'expired-session-id',
     targetUserId: 'user-id'
   });

   socket.on('exception', (error) => {
     console.log(error.message); // "Vote session not found or expired"
   });
   ```

4. **Start New Vote** - should succeed since old vote expired.

## Writing New Tests

### Adding Unit Tests

1. **Create test file** alongside source file:
   ```
   src/feature/feature.service.ts
   src/feature/feature.service.spec.ts
   ```

2. **Use NestJS testing module**:
   ```typescript
   import { Test } from '@nestjs/testing';
   import { FeatureService } from './feature.service';

   describe('FeatureService', () => {
     let service: FeatureService;

     beforeEach(async () => {
       const module = await Test.createTestingModule({
         providers: [FeatureService],
       }).compile();

       service = module.get<FeatureService>(FeatureService);
     });

     it('should test something', () => {
       expect(service.method()).toBe(expected);
     });
   });
   ```

3. **Run your test**:
   ```bash
   npm test -- feature.service.spec.ts
   ```

### Adding E2E Tests

1. **Create test file** in `test/` directory:
   ```
   test/feature.e2e-spec.ts
   ```

2. **Set up application**:
   ```typescript
   import { Test } from '@nestjs/testing';
   import { INestApplication } from '@nestjs/common';
   import { AppModule } from '../src/app.module';

   describe('Feature (e2e)', () => {
     let app: INestApplication;

     beforeAll(async () => {
       const module = await Test.createTestingModule({
         imports: [AppModule],
       }).compile();

       app = module.createNestApplication();
       await app.init();
       await app.listen(0); // For WebSocket tests
     });

     afterAll(async () => {
       await app.close();
     });
   });
   ```

3. **Clean up between tests**:
   ```typescript
   beforeEach(async () => {
     // Clean database
     await repository.query('DELETE FROM table');

     // Clean Redis
     const redis = redisService.getClient();
     await redis.flushdb();
   });
   ```

4. **Test WebSocket events**:
   ```typescript
   import { io, Socket } from 'socket.io-client';

   let socket: Socket;

   beforeEach(async () => {
     socket = io(`http://localhost:${port}`, {
       auth: { token: 'jwt-token' }
     });

     await new Promise((resolve) => {
       socket.on('connect', resolve);
     });
   });

   afterEach(() => {
     socket.disconnect();
   });

   it('should handle event', async () => {
     const responsePromise = new Promise((resolve) => {
       socket.on('response-event', resolve);
     });

     socket.emit('request-event', data);

     const response = await responsePromise;
     expect(response).toMatchObject(expected);
   });
   ```

### Testing Best Practices

1. **Arrange-Act-Assert Pattern**:
   ```typescript
   it('should do something', () => {
     // Arrange
     const input = 'test';
     const expected = 'result';

     // Act
     const result = service.method(input);

     // Assert
     expect(result).toBe(expected);
   });
   ```

2. **Use Descriptive Test Names**:
   ```typescript
   ✅ it('should return user when valid credentials provided')
   ❌ it('should work')
   ```

3. **Test One Thing Per Test**:
   ```typescript
   ✅ it('should reject invalid email')
   ✅ it('should reject invalid password')
   ❌ it('should validate credentials') // Too broad
   ```

4. **Mock External Dependencies**:
   ```typescript
   const mockRepository = {
     findOne: jest.fn(),
     save: jest.fn(),
   };

   const module = await Test.createTestingModule({
     providers: [
       Service,
       { provide: getRepositoryToken(Entity), useValue: mockRepository },
     ],
   }).compile();
   ```

5. **Clean Up After Tests**:
   ```typescript
   afterEach(async () => {
     await cleanup();
   });
   ```

## Troubleshooting

### Issue: E2E Tests Failing with "RuntimeException"

**Cause**: Database or Redis not running

**Solution**:
```bash
docker-compose up -d
# Wait for services to be ready
npm run test:e2e
```

### Issue: "Port already in use"

**Cause**: Previous test process didn't clean up

**Solution**:
```bash
# Kill any running node processes
pkill -f node
# Or find and kill specific port
lsof -ti:3000 | xargs kill
```

### Issue: WebSocket Connection Timeout in Tests

**Cause**: Application not fully initialized

**Solution**:
```typescript
// Ensure app is listening before creating sockets
await app.listen(0);

// Add connection timeout
const socket = io(url, {
  timeout: 5000,
  transports: ['websocket']
});
```

### Issue: Tests Pass Locally but Fail in CI

**Cause**: Race conditions or timing issues

**Solution**:
- Add proper waits for async operations
- Use deterministic IDs in tests
- Increase timeouts for CI environment
- Clean up thoroughly between tests

### Issue: "Vote session not found" in Tests

**Cause**: Vote expired or Redis flushed between operations

**Solution**:
- Ensure Redis is persistent during test
- Complete vote operations quickly
- Don't flush Redis in the middle of vote flow

### Issue: Mock Data Not Resetting Between Tests

**Cause**: Shared state in mocks

**Solution**:
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockRepository.findOne.mockReset();
});
```

## Test Data Management

### Creating Test Users

```typescript
async function createTestUser(username: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      username,
      password: 'password123',
      displayName: `Test ${username}`,
    });

  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password: 'password123' });

  return {
    username,
    token: response.body.accessToken,
    userId: response.body.user.id,
  };
}
```

### Creating Test Rooms

```typescript
async function createTestRoom(ownerToken: string) {
  const response = await request(app.getHttpServer())
    .post('/rooms')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      roomName: 'Test Room',
      settings: {
        maxMembers: 10,
        mutinyThreshold: 0.51,
        djCooldownMinutes: 5,
      },
    });

  return response.body;
}
```

### Cleaning Test Data

```typescript
beforeEach(async () => {
  // Clean in reverse order of foreign key dependencies
  await voteRepository.query('DELETE FROM votes');
  await roomDjHistoryRepository.query('DELETE FROM room_dj_history');
  await messageRepository.query('DELETE FROM messages');
  await roomMemberRepository.query('DELETE FROM room_members');
  await roomRepository.query('DELETE FROM rooms');
  await userRepository.query('DELETE FROM users WHERE username LIKE $1', ['test%']);

  // Clean Redis
  const redis = redisService.getClient();
  await redis.flushdb();
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test

      - name: Run e2e tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@postgres:5432/groovebox_test
          REDIS_HOST: redis
```

## Performance Testing

### Load Testing Vote System

```bash
# Install k6 for load testing
# https://k6.io/docs/getting-started/installation/

# Create load test script
cat > vote-load-test.js << 'EOF'
import ws from 'k6/ws';
import { check } from 'k6';

export default function () {
  const url = 'ws://localhost:3000';
  const params = { headers: { 'Authorization': 'Bearer token' } };

  ws.connect(url, params, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({
        event: 'vote:start-election',
        data: 'ABC123'
      }));
    });

    socket.on('message', (data) => {
      check(data, { 'received response': (r) => r !== '' });
    });

    socket.setTimeout(() => socket.close(), 5000);
  });
}
EOF

# Run load test
k6 run vote-load-test.js
```

---

## Summary

This guide covers:
- ✅ Running all test types (unit, integration, e2e)
- ✅ Comprehensive governance testing scenarios
- ✅ Manual testing procedures
- ✅ Writing new tests
- ✅ Troubleshooting common issues
- ✅ CI/CD integration
- ✅ Performance testing

For more information:
- [Governance API Documentation](./api/governance-api.md)
- [NestJS Testing Documentation](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/)
- [Socket.io Testing Guide](https://socket.io/docs/v4/testing/)

---

**Last Updated**: 2025-11-23
**Test Count**: 177+ passing tests
**Coverage**: Unit tests for all services, controllers, and gateways; E2E tests for governance flows
