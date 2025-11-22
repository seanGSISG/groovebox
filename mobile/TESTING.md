# GrooveBox Phase 2 Frontend Testing Guide

## Prerequisites for Testing

- 3+ physical devices (iOS or Android)
- All devices on same WiFi network
- Backend running and accessible
- Test audio file prepared

## Test Procedure

### 1. Setup

1. Build and install app on all test devices
2. Update `src/config/api.ts` with backend IP address
3. Register user accounts on each device
4. Verify all devices can connect to backend

### 2. Basic Flow Test

**Device 1 (DJ):**
1. Login
2. Create room (note room code)
3. Verify sync metrics show reasonable offset/RTT

**Devices 2-3:**
1. Login
2. Join room using code
3. Verify sync metrics displayed

### 3. Synchronized Playback Test

**Device 1 (DJ):**
1. Press "Play" button
2. Observe sync metrics during playback

**All Devices:**
1. Verify playback starts at same time (audibly)
2. Place devices close together to detect echo/drift
3. Listen for ~30 seconds
4. Check sync metrics - should show drift <50ms

**Expected:** No audible echo or drift

### 4. Mid-Song Join Test

**Setup:** Playback already active on Devices 1-2

**Device 3:**
1. Join room during playback
2. Verify playback catches up to current position
3. Verify sync with other devices within 5-10 seconds

**Expected:** Device 3 syncs with others, no restart

### 5. Drift Correction Test

1. Let playback run for 5+ minutes
2. Monitor drift metrics
3. Observe drift correction events in logs

**Expected:** Drift stays below 100ms, periodic corrections occur

### 6. Network Stress Test

1. Start playback on all devices
2. Toggle WiFi off/on on one device
3. Verify reconnection and re-sync

**Expected:** Device reconnects, re-syncs within 10-20 seconds

## Measuring Actual Sync Accuracy

### Method 1: Audio Recording

1. Start synchronized playback on all devices
2. Record audio with external microphone (all devices audible)
3. Import recording into DAW (Audacity, Ableton, etc.)
4. Align waveforms visually
5. Measure time difference between peaks

**Target:** <50ms difference (95th percentile)

### Method 2: Visual Observation

1. Use test track with strong transients (drum hits)
2. Place all devices in circle
3. Listen for echo/phase cancellation
4. Adjust positions to detect drift

**Target:** No audible echo

## Known Issues & Debugging

### High RTT (>500ms)
- Check WiFi signal strength
- Verify backend accessible
- Test with device closer to router

### Drift Increasing Over Time
- Check drift correction logs
- Verify clock sync frequency
- Check device CPU usage (throttling)

### Playback Not Starting
- Check backend logs for errors
- Verify JWT token valid
- Check WebSocket connection status

## Metrics to Track

Record these for each test session:

- Number of devices: ___
- Average RTT: ___ms
- Average clock offset: ___ms
- Maximum observed drift: ___ms
- Test duration: ___minutes
- Network conditions: ___
- Issues encountered: ___

## Success Criteria

✅ All devices start playback within 100ms of each other
✅ Drift stays below 50ms during 5-minute playback
✅ Mid-song join syncs within 10 seconds
✅ No crashes or connection failures
✅ Drift correction occurs automatically
✅ Sync metrics displayed accurately
