import { ClockSyncManager } from '../ClockSyncManager';
import { Socket } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('ClockSyncManager', () => {
  let mockSocket: jest.Mocked<Socket>;
  let manager: ClockSyncManager;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      off: jest.fn(),
    } as any;

    manager = new ClockSyncManager(mockSocket);
  });

  afterEach(() => {
    manager.stopSync();
  });

  it('should calculate clock offset correctly', () => {
    // Setup listener
    const pongCallback = (mockSocket.on as jest.Mock).mock.calls.find(
      call => call[0] === 'sync:pong'
    )?.[1];

    expect(pongCallback).toBeDefined();

    // Simulate sync:pong response
    const clientT0 = 1000;
    const serverT1 = 1050; // Server received 50ms later
    const serverT2 = 1051; // Server sent 1ms later
    // clientT3 will be captured in the handler

    // Mock Date.now for clientT3
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => 1102); // Client received 102ms after sending

    pongCallback({
      clientT0,
      serverT1,
      serverT2,
    });

    Date.now = originalDateNow;

    const offset = manager.getOffset();
    // Expected offset calculation:
    // RTT = (clientT3 - clientT0) - (serverT2 - serverT1) = (1102 - 1000) - (1051 - 1050) = 101ms
    // Offset = ((serverT1 - clientT0) + (serverT2 - clientT3)) / 2
    //        = ((1050 - 1000) + (1051 - 1102)) / 2
    //        = (50 + (-51)) / 2 = -0.5ms

    expect(offset).toBeCloseTo(-0.5, 1);
  });

  it('should emit sync:ping when startSync is called', () => {
    jest.useFakeTimers();

    manager.startSync(false);

    // Should emit immediately
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'sync:ping',
      expect.objectContaining({ clientT0: expect.any(Number) })
    );

    jest.useRealTimers();
  });

  it('should sync more frequently during playback', () => {
    jest.useFakeTimers();

    manager.startSync(true); // isPlaying = true

    const initialCallCount = mockSocket.emit.mock.calls.length;

    // Advance by 10 seconds (playing interval)
    jest.advanceTimersByTime(10000);

    expect(mockSocket.emit.mock.calls.length).toBeGreaterThan(initialCallCount);

    jest.useRealTimers();
  });

  it('should convert server time to local time', () => {
    manager['clockOffset'] = 50; // Client is 50ms ahead

    const serverTime = 1000;
    const localTime = manager.serverTimeToLocal(serverTime);

    expect(localTime).toBe(950); // 1000 - 50
  });
});
