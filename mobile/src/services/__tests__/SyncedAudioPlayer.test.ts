import { SyncedAudioPlayer } from '../SyncedAudioPlayer';
import { ClockSyncManager } from '../ClockSyncManager';
import TrackPlayer from 'react-native-track-player';

// Mock dependencies
jest.mock('react-native-track-player', () => ({
  setupPlayer: jest.fn().mockResolvedValue(undefined),
  add: jest.fn().mockResolvedValue(undefined),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  reset: jest.fn().mockResolvedValue(undefined),
  seekTo: jest.fn().mockResolvedValue(undefined),
  getPosition: jest.fn().mockResolvedValue(0),
  getState: jest.fn().mockResolvedValue('playing'),
  State: {
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
  },
}));

describe('SyncedAudioPlayer', () => {
  let mockSyncManager: jest.Mocked<ClockSyncManager>;
  let player: SyncedAudioPlayer;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSyncManager = {
      serverTimeToLocal: jest.fn((serverTime) => serverTime - 50), // Mock 50ms offset
      getOffset: jest.fn(() => 50),
      getRtt: jest.fn(() => 100),
    } as any;

    player = new SyncedAudioPlayer(mockSyncManager);
  });

  afterEach(() => {
    player.destroy();
  });

  it('should schedule playback in the future', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const event = {
      trackId: 'test-track',
      trackSource: 'local',
      startAtServerTime: 2000, // Server time
      startPosition: 0,
      serverTimestamp: 1000,
    };

    // Mock Date.now to return 900 (local time)
    // startAtServerTime in local time = 2000 - 50 = 1950
    // delay = 1950 - 900 = 1050ms
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => 900);

    await player.handlePlaybackStart(event);

    // Should schedule playback with setTimeout
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1050);

    Date.now = originalDateNow;
    jest.useRealTimers();
  });

  it('should seek to catch-up position if start time is in past', async () => {
    const event = {
      trackId: 'test-track',
      trackSource: 'local',
      startAtServerTime: 1000,
      startPosition: 0,
      serverTimestamp: 1000,
    };

    // Mock Date.now so start time is in the past
    // startAtServerTime in local = 1000 - 50 = 950
    // now = 2000, so we're 1050ms late
    // Should seek to 1.05 seconds
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => 2000);

    await player.handlePlaybackStart(event);

    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(1.05); // 1050ms late / 1000 = 1.05s
    expect(TrackPlayer.play).toHaveBeenCalled();

    Date.now = originalDateNow;
  });

  it('should correct drift if exceeds threshold', async () => {
    jest.useFakeTimers();

    // Start playback to set up drift correction
    const event = {
      trackId: 'test-track',
      trackSource: 'local',
      startAtServerTime: Date.now() + 1000,
      startPosition: 0,
      serverTimestamp: Date.now(),
    };

    await player.handlePlaybackStart(event);

    // Clear the seekTo calls from handlePlaybackStart
    (TrackPlayer.seekTo as jest.Mock).mockClear();

    // Mock getPosition to return position ahead of expected
    (TrackPlayer.getPosition as jest.Mock).mockResolvedValue(5.3); // 5.3 seconds

    // Fast-forward time so expected position is 5.0 seconds
    // Drift = 5.3 - 5.0 = 0.3s = 300ms (exceeds SEEK_THRESHOLD_MS of 200ms)
    jest.advanceTimersByTime(5000);

    // Trigger drift correction
    jest.advanceTimersByTime(5000); // DRIFT_CHECK_INTERVAL_MS

    // Run all pending promises
    await Promise.resolve();
    await Promise.resolve();

    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(expect.any(Number));

    jest.useRealTimers();
  });
});
