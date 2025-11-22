# Audio Synchronization - Quick Reference

This document provides a quick reference for understanding and debugging GrooveBox's audio synchronization system.

## Core Concepts

### 1. The Problem
When you tell multiple devices to play the same audio file "now", they don't actually start at the same moment because:
- Network messages arrive at different times (latency varies: 10-500ms)
- Device clocks drift apart (1-100ms difference is common)
- Processing time varies per device

**Result without sync**: Echo effect (devices playing 50-500ms apart)

### 2. The Solution: Three-Part System

```
┌─────────────────────────────────────────────────────────────┐
│                  1. Clock Synchronization                   │
│  Every 30 seconds, measure time difference between         │
│  client and server clocks. Store this offset.              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  2. Scheduled Playback                      │
│  Server says "everyone start at 12:00:05.500"              │
│  Each client converts to their local time using offset     │
│  All devices start at same effective moment                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  3. Drift Correction                        │
│  Every 5-10 seconds, check if still in sync                │
│  If drift detected (>50ms), make small correction          │
└─────────────────────────────────────────────────────────────┘
```

---

## Clock Synchronization (NTP-Inspired)

### Algorithm

```
Client sends ping at local time t0
  ──────────────────────>
                         Server receives at server time t1
                         Server sends pong at server time t2
  <──────────────────────
Client receives at local time t3

Round-Trip Time (RTT):
  rtt = (t3 - t0) - (t2 - t1)

Clock Offset (client ahead of server if positive):
  offset = ((t1 - t0) + (t2 - t3)) / 2

Apply smoothing (reduce jitter):
  smoothedOffset = 0.3 * newOffset + 0.7 * previousOffset
```

### Example

```
Client sends:     t0 = 1000 (local ms)
Server receives:  t1 = 1050 (server ms)
Server sends:     t2 = 1051 (server ms)
Client receives:  t3 = 1101 (local ms)

RTT = (1101 - 1000) - (1051 - 1050) = 101 - 1 = 100ms
Offset = ((1050 - 1000) + (1051 - 1101)) / 2
       = (50 + (-50)) / 2
       = 0ms

→ Client clock is perfectly aligned with server!
```

### Time Conversion

```typescript
// Convert server time to local time
localTime = serverTime - clockOffset

// Convert local time to server time
serverTime = localTime + clockOffset
```

---

## Scheduled Playback

### Flow

```
1. DJ presses "Play" button
   ↓
2. Mobile app sends to server: { event: 'playback:start', trackId: 'xyz' }
   ↓
3. Server calculates future start time:
   serverNow = 1700000000000 (Unix ms)
   syncBuffer = 1000ms (configurable, must exceed max RTT)
   startAtServerTime = 1700000001000
   ↓
4. Server broadcasts to all clients:
   {
     event: 'playback:start',
     trackId: 'xyz',
     startAtServerTime: 1700000001000,
     startPosition: 0
   }
   ↓
5. Each client converts to local time:
   localStartTime = 1700000001000 - clockOffset
   ↓
6. Each client schedules playback:
   delayMs = localStartTime - Date.now()
   setTimeout(() => audioPlayer.play(), delayMs)
   ↓
7. All devices start playing at the same effective moment!
```

### Why the Buffer?

The sync buffer (default 1000ms) ensures:
- All clients receive the message before the scheduled start time
- Clients with high latency (300-500ms) still have time to process
- Room for CPU processing and audio system preparation

**Adaptive Buffer**: For rooms with high-latency users, increase buffer:
```typescript
const maxRtt = getMaxRttInRoom(); // e.g., 400ms
const syncBuffer = Math.max(1000, maxRtt * 2.5); // At least 2.5x max RTT
```

---

## Drift Correction

### Why Drift Happens

Even with perfect initial sync, drift accumulates due to:
- Audio clock != system clock (audio hardware has separate crystal)
- CPU load affects playback (buffering, frame drops)
- Network delays in sync updates
- Temperature changes (affects crystal frequency)

**Typical drift**: 10-50ms over 5 minutes

### Correction Algorithm

```typescript
Every 5 seconds during playback:

1. Calculate expected position:
   elapsedTime = Date.now() - localStartTime
   expectedPosition = startPosition + (elapsedTime / 1000)

2. Get actual position:
   actualPosition = audioPlayer.getPosition()

3. Calculate drift:
   driftMs = (actualPosition - expectedPosition) * 1000

4. Apply correction:
   if (|driftMs| < 50ms):
     // Ignore, within tolerance
   else if (|driftMs| < 200ms):
     // Small drift: seek or time-stretch
     audioPlayer.seekTo(expectedPosition)
   else:
     // Large drift: immediate seek
     audioPlayer.seekTo(expectedPosition)
```

### Time-Stretching (Advanced)

Instead of seeking (which can be audible), time-stretching gradually speeds up/slows down playback by 1-2% to smooth out corrections.

```
Drift: +100ms (client is ahead)
→ Slow down playback to 0.98x for 5 seconds
→ Drift reduces to +2ms (within tolerance)
```

Most audio libraries don't support this, so we use micro-seeks instead.

---

## Key Parameters

| Parameter | Default | Purpose | Tuning Guide |
|-----------|---------|---------|--------------|
| **SYNC_BUFFER_MS** | 1000ms | Delay between command and playback | Increase if high-latency users (>500ms RTT) |
| **SYNC_INTERVAL_IDLE** | 30000ms | Clock sync frequency (idle) | Can reduce to save battery |
| **SYNC_INTERVAL_PLAYING** | 10000ms | Clock sync frequency (playing) | Decrease for tighter sync (more battery) |
| **DRIFT_CHECK_INTERVAL** | 5000ms | How often to check drift | Decrease for faster correction |
| **DRIFT_THRESHOLD** | 50ms | Ignore drift below this | Increase if over-correcting |
| **SEEK_THRESHOLD** | 200ms | Seek if drift exceeds this | Decrease for tighter sync |
| **MAX_RTT_THRESHOLD** | 1000ms | Reject clients above this | Increase for poor networks |

---

## Monitoring & Debugging

### Key Metrics to Track

**Per Client:**
- Clock offset (ms)
- RTT (ms)
- Drift (ms)
- Sync quality score (custom metric)

**Per Room:**
- Max RTT across all clients
- Average offset std deviation (should be low)
- Number of drift corrections per minute

### Debug Logs

```typescript
// Clock sync
console.log(`[Sync] Offset: ${offset.toFixed(2)}ms, RTT: ${rtt.toFixed(2)}ms`);

// Playback scheduling
console.log(`[Playback] Scheduling in ${delayMs}ms (serverStart: ${startAtServerTime}, localStart: ${localStartTime})`);

// Drift correction
console.log(`[Drift] Expected: ${expectedPos.toFixed(3)}s, Actual: ${actualPos.toFixed(3)}s, Drift: ${driftMs.toFixed(2)}ms`);
```

### Testing Sync Accuracy

**Manual Method (Low-tech):**
1. Start playback on 3+ devices
2. Use external recorder to capture all audio simultaneously
3. Import into DAW (e.g., Audacity, Logic Pro)
4. Zoom in on waveforms
5. Measure time difference between first peaks

**Target**: <50ms drift

**Automated Method:**
1. Each client logs: `playbackStartedAt = Date.now()` when playback begins
2. Send to server for comparison
3. Server calculates: `maxDrift = max(timestamps) - min(timestamps)`

---

## Common Issues & Solutions

### Issue: Large Initial Offset (>500ms)

**Symptoms**: Devices start playing far apart

**Causes**:
- Clock sync not running
- Poor network causing bad offset calculation
- Wrong offset sign (should be client - server)

**Solutions**:
- Verify clock sync is running (`syncManager.startSync()`)
- Check logs for sync:pong events
- Increase sync frequency temporarily
- Verify offset calculation matches NTP formula

---

### Issue: Increasing Drift Over Time

**Symptoms**: Start in sync, but drift grows to >200ms after 5+ minutes

**Causes**:
- Drift correction not running
- Audio hardware clock mismatch
- CPU throttling on device

**Solutions**:
- Verify drift correction loop is running
- Decrease DRIFT_CHECK_INTERVAL to 3000ms
- Lower DRIFT_THRESHOLD to 30ms
- Check device battery saver mode (can throttle audio)

---

### Issue: Audible Seek Clicks

**Symptoms**: Hear clicks/pops during playback

**Causes**:
- Too frequent drift corrections
- Threshold too low

**Solutions**:
- Increase DRIFT_THRESHOLD to 100ms
- Increase DRIFT_CHECK_INTERVAL to 10000ms
- Implement time-stretching instead of seeking
- Use crossfade seeks if supported

---

### Issue: Echo Effect (Devices >100ms Apart)

**Symptoms**: Sounds like echo, can hear same audio twice

**Causes**:
- SYNC_BUFFER too short
- High network latency
- Clock sync failed

**Solutions**:
- Measure RTT for all clients
- Increase SYNC_BUFFER to max(RTT) * 3
- Kick clients with RTT > MAX_RTT_THRESHOLD
- Verify all clients received playback:start event

---

## Advanced: Join Mid-Song

When a user joins while music is playing:

```typescript
1. Server sends current state:
   {
     currentTrack: 'xyz',
     startedAtServerTime: 1700000001000,  // When track started
     startPosition: 0,
     serverTimestamp: 1700000045000       // Current server time
   }

2. Client calculates how far into the track we are:
   // Convert to local time
   localStartTime = startedAtServerTime - clockOffset
   nowLocal = Date.now()

   // How long has track been playing?
   elapsedMs = nowLocal - localStartTime
   elapsedSeconds = elapsedMs / 1000

   // Where should we be in the track?
   currentPosition = startPosition + elapsedSeconds

3. Client seeks to position and starts:
   audioPlayer.seekTo(currentPosition)
   audioPlayer.play()

4. Drift correction takes over and fine-tunes within 5-10s
```

---

## Performance Considerations

### Battery Impact

**Clock Sync**: Minimal (<1% drain per hour)
- Uses lightweight WebSocket messages
- Can reduce frequency when idle

**Drift Correction**: Low (<2% drain per hour)
- Periodic position checks
- Can pause when screen off (if background playback disabled)

### Network Usage

**Clock Sync**:
- ~100 bytes per sync
- 30s interval: ~200 KB per hour

**Playback Commands**:
- ~500 bytes per command
- Negligible unless changing tracks every second

### CPU Usage

**Negligible**:
- setTimeout and Date.now() are native and fast
- No heavy computation
- Audio decoding is hardware-accelerated

---

## Formula Reference

```typescript
// Clock Offset (NTP)
offset = ((t1 - t0) + (t2 - t3)) / 2

// Round-Trip Time
rtt = (t3 - t0) - (t2 - t1)

// Exponential Smoothing
smoothedValue = α * newValue + (1 - α) * previousValue
// where α = 0.3 (smoothing factor)

// Time Conversion
localTime = serverTime - offset
serverTime = localTime + offset

// Expected Playback Position
expectedPosition = startPosition + (Date.now() - localStartTime) / 1000

// Drift
drift = actualPosition - expectedPosition
```

---

## Code Checklist

When implementing, ensure you have:

- [ ] Clock sync ping sent every SYNC_INTERVAL_MS
- [ ] Clock sync pong handler with NTP calculation
- [ ] Offset stored and smoothed with exponential moving average
- [ ] Playback start handler converts serverTime to localTime
- [ ] setTimeout schedules playback at exact localStartTime
- [ ] Handle past start times (delayed network)
- [ ] Drift correction loop runs every DRIFT_CHECK_INTERVAL_MS
- [ ] Seek to correct position if drift > threshold
- [ ] Mid-song join calculates elapsed time correctly
- [ ] All timestamps use Date.now() for consistency
- [ ] Sync frequency increases during playback
- [ ] Logs show offset, RTT, and drift for debugging

---

**Quick Diagnostic**

If audio is out of sync:
1. Check offset: Should be <200ms, stable
2. Check RTT: Should be <500ms, stable
3. Check drift: Should stay <50ms with corrections
4. Check SYNC_BUFFER: Should be > max RTT
5. Check logs: Look for missed events or errors

**Last Updated**: 2025-11-22
