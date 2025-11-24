# Jukebox Reference App Analysis

## Executive Summary

The reference jukebox app (located at `reference/jukebox-main/`) is a **web-based collaborative playlist application** that allows users to create "boxes" (playlists), search YouTube, and queue songs for playback. While it shares some conceptual similarities with GrooveBox, it has significant architectural differences that make direct code porting challenging. However, several patterns and implementations can be adapted for GrooveBox's Phase 4 (Music Integration).

## Key Differences: Jukebox vs GrooveBox

| Feature | Jukebox | GrooveBox |
|---------|---------|-----------|
| **Platform** | Web (React + Vite) | Mobile (React Native) |
| **Backend** | Express.js + TypeScript | NestJS + Socket.io |
| **Database** | SQLite + Knex | PostgreSQL + Redis |
| **Primary Focus** | Collaborative playlists | Synchronized multi-device playback |
| **Real-time** | REST API only | WebSocket-based (Socket.io) |
| **Audio Source** | YouTube downloads to S3 | YouTube streaming (planned) |
| **Audio Storage** | Downloads & stores in S3/MinIO | Stream directly (no storage) |
| **Sync System** | None (single playback) | Millisecond-precision sync across devices |
| **Queue System** | Position-based ordering | Vote-based (already implemented) |
| **Authentication** | Anonymous fingerprint-based | JWT-based user accounts |

## What Jukebox Does Well (Adaptable to GrooveBox)

### 1. YouTube API Integration ✅

**Location:** `server/src/index.ts:1623-1700`

Jukebox implements a robust YouTube search API that:
- Searches YouTube with the Music category filter
- Fetches video details including duration
- Returns formatted results with thumbnails
- Handles API errors gracefully

**Code Pattern:**
```typescript
// Search for videos
const searchUrl =
  `https://www.googleapis.com/youtube/v3/search?` +
  `part=snippet&type=video&videoCategoryId=10&` + // Music category
  `q=${encodeURIComponent(query)}&` +
  `maxResults=${maxResults}&` +
  `key=${API_KEY}`;

// Get video details for duration
const detailsUrl =
  `https://www.googleapis.com/youtube/v3/videos?` +
  `part=contentDetails&` +
  `id=${videoIds}&` +
  `key=${API_KEY}`;
```

**✅ Can Adapt:** This exact pattern can be added to GrooveBox's `queue` module as a new endpoint.

### 2. YouTube Audio Download & Processing ⚠️

**Location:** `server/src/youtube-worker.ts`

Jukebox uses a **worker process** that:
- Continuously polls for pending YouTube downloads
- Uses `@distube/ytdl-core` to extract audio streams
- Uploads to S3 (MinIO) for storage
- Implements retry logic and status tracking
- Sends email notifications on success/failure

**Database Schema:**
```sql
CREATE TABLE song_youtube_status (
  youtube_id TEXT PRIMARY KEY,
  status ENUM('pending', 'processing', 'completed', 'failed'),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT
)
```

**⚠️ Partially Adaptable:**
- The worker pattern is useful for background processing
- However, GrooveBox likely wants to **stream** YouTube audio directly rather than download/store
- The status tracking pattern is still valuable for monitoring YouTube availability

### 3. S3/MinIO Storage Integration ⚠️

**Location:** `server/src/index.ts:18-36`, `youtube-worker.ts:64-80`

Jukebox stores downloaded audio files in S3-compatible storage and generates presigned URLs for playback.

**⚠️ Not Directly Applicable:**
- GrooveBox doesn't need to store YouTube audio (copyright concerns, storage costs)
- However, could be useful for user-uploaded local files in future

### 4. Fair Queue Positioning Algorithm ❌

**Location:** Database schema with `box_songs.position`

Jukebox uses position-based ordering where:
- Songs are assigned sequential positions
- "Fair queuing" ensures each user gets turns
- Position is calculated to interleave songs from different users

**❌ Not Needed:** GrooveBox already has a **vote-based queue system** (better for democratic selection).

### 5. Anonymous User System via Fingerprinting ❌

**Location:** `server/src/index.ts`, uses browser fingerprinting

Jukebox allows anonymous users identified by browser fingerprints.

**❌ Not Applicable:** GrooveBox uses JWT authentication with user accounts.

### 6. Frontend: YouTube Search Component ✅

**Location:** `frontend/src/components/SongSearch.tsx`

A React component with:
- Debounced search input (1.5s delay)
- Loading states
- YouTube result cards with thumbnails
- "Add to queue" functionality
- Duplicate prevention

**✅ Can Adapt:** While GrooveBox is React Native (not React web), the logic and UX patterns can be adapted to mobile UI.

### 7. Frontend: Interactive Drag-and-Drop Queue ⚠️

**Location:** `frontend/src/components/InteractiveSongTable.tsx`

Uses `@dnd-kit` for drag-and-drop reordering of songs in the queue.

**⚠️ Partially Adaptable:** React Native doesn't have `@dnd-kit`, but similar drag-and-drop can be implemented with `react-native-draggable-flatlist`.

## What GrooveBox Already Has (Better Than Jukebox)

| Feature | Status |
|---------|--------|
| **Real-time updates** | ✅ WebSocket with Socket.io (Jukebox uses REST polling) |
| **Vote-based queue** | ✅ Already implemented with upvote system |
| **Room membership** | ✅ Already implemented with JWT auth |
| **Democratic governance** | ✅ DJ election, mutiny system |
| **Multi-device sync** | ✅ NTP-inspired clock sync, coordinated playback |

## Recommended Adaptations for GrooveBox

### Priority 1: YouTube Search API (High Value, Low Effort)

**Recommendation:** Directly port the YouTube search endpoint to GrooveBox backend.

**Implementation Steps:**

1. **Create new endpoint in `queue` module:**
   ```bash
   # In backend/
   nest generate controller queue/youtube
   nest generate service queue/youtube
   ```

2. **Add YouTube search endpoint:**
   ```typescript
   // backend/src/queue/youtube.controller.ts
   @Get('youtube/search')
   async searchYouTube(
     @Query('q') query: string,
     @Query('maxResults') maxResults: number = 10
   ) {
     // Copy logic from jukebox index.ts:1623-1700
     // Make two API calls: search + video details
     return this.youtubeService.search(query, maxResults);
   }
   ```

3. **Add to `.env`:**
   ```bash
   YOUTUBE_API_KEY=your-key-here
   ```

4. **Update mobile app to use new endpoint:**
   ```typescript
   // mobile/src/services/youtube.service.ts
   async searchYouTube(query: string) {
     const response = await axios.get(`${API_URL}/queue/youtube/search`, {
       params: { q: query, maxResults: 10 }
     });
     return response.data.items;
   }
   ```

**Estimated Effort:** 4-6 hours

**Files to Create/Modify:**
- `backend/src/queue/youtube.controller.ts` (new)
- `backend/src/queue/youtube.service.ts` (new)
- `mobile/src/services/youtube.service.ts` (new)
- `backend/.env` (add YOUTUBE_API_KEY)

### Priority 2: YouTube Playback (Streaming, Not Downloading)

**Recommendation:** Use YouTube streaming libraries for **direct playback** without storage.

**Why NOT Copy Jukebox's Download Approach:**
- Storage costs (S3/MinIO)
- Copyright concerns (storing YouTube content)
- Slower playback start (download time)
- Bandwidth waste (each device downloads separately)

**Better Approach for GrooveBox:**

Use **React Native YouTube Player** for direct streaming:

```bash
cd mobile
npm install react-native-youtube-iframe
```

**Implementation:**
```typescript
// mobile/src/components/YouTubePlayer.tsx
import YouTubeIframe from 'react-native-youtube-iframe';

<YouTubeIframe
  videoId={youtubeId}
  play={isPlaying}
  onChangeState={handleStateChange}
  initialPlayerParams={{
    start: startPosition
  }}
/>
```

**Sync Challenge:** YouTube iframe doesn't give precise control for synchronization.

**Alternative:** Use `ytdl-core` on mobile to extract direct stream URLs, then use `react-native-track-player` for synchronized playback:

```typescript
// Backend: Extract stream URL
@Get('youtube/stream-url/:videoId')
async getStreamUrl(@Param('videoId') videoId: string) {
  const info = await ytdl.getInfo(videoId);
  const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
  return { url: format.url, expiresAt: Date.now() + 3600000 }; // 1 hour expiry
}

// Mobile: Play via track-player
const streamUrl = await getYouTubeStreamUrl(videoId);
await TrackPlayer.add({
  id: videoId,
  url: streamUrl,
  title: songTitle
});
```

**⚠️ Legal Consideration:** Extracting YouTube streams may violate YouTube's Terms of Service. Consider using YouTube Music API or Spotify SDK instead for production.

**Estimated Effort:** 12-16 hours (including testing sync accuracy)

### Priority 3: YouTube Metadata Extraction

**Recommendation:** Adapt jukebox's video detail fetching for song metadata.

**Use Case:** When user submits YouTube URL, auto-populate title, artist, duration, thumbnail.

**Implementation:**
```typescript
// backend/src/queue/youtube.service.ts
async getVideoMetadata(youtubeUrl: string) {
  const videoId = this.extractVideoId(youtubeUrl);

  const detailsUrl =
    `https://www.googleapis.com/youtube/v3/videos?` +
    `part=snippet,contentDetails&` +
    `id=${videoId}&` +
    `key=${this.apiKey}`;

  const response = await fetch(detailsUrl);
  const data = await response.json();

  const video = data.items[0];
  return {
    title: video.snippet.title,
    artist: video.snippet.channelTitle,
    duration: this.parseDuration(video.contentDetails.duration),
    thumbnail_url: video.snippet.thumbnails.high.url
  };
}
```

**Integration Point:** `queue.service.ts` `submitSong()` method can call this before saving to database.

**Estimated Effort:** 2-3 hours

### Priority 4: Background Worker Pattern (Status Tracking)

**Recommendation:** Adapt jukebox's worker pattern for **YouTube availability checking** (not downloading).

**Use Case:** Periodically check if submitted YouTube videos are still available (not deleted, region-restricted, etc.).

**Implementation:**
```typescript
// backend/src/queue/youtube-health-worker.ts
async checkYouTubeAvailability() {
  // Find songs with youtube_id that haven't been checked in 24h
  const songs = await this.queueService.findStaleYouTubeSongs();

  for (const song of songs) {
    try {
      const info = await ytdl.getInfo(song.youtube_id);
      // Still available
      await this.queueService.markYouTubeAvailable(song.id);
    } catch (err) {
      // Deleted or unavailable
      await this.queueService.markYouTubeUnavailable(song.id, err.message);
    }
  }
}
```

**Run via cron:** Use `@nestjs/schedule` to run every 6 hours.

**Estimated Effort:** 6-8 hours

### Priority 5: Mobile Search UI Component

**Recommendation:** Adapt the search component UX patterns (not direct code) for React Native.

**Key UX Patterns to Copy:**
- Debounced search (1.5s delay)
- Loading spinner during search
- Result cards with thumbnails
- "Add to Queue" button
- Show song duration
- Prevent duplicate submissions

**React Native Implementation:**
```typescript
// mobile/src/screens/YouTubeSearchScreen.tsx
const [query, setQuery] = useState('');
const [results, setResults] = useState([]);
const [isSearching, setIsSearching] = useState(false);

// Debounced search
useEffect(() => {
  const timer = setTimeout(() => {
    if (query) performSearch(query);
  }, 1500);
  return () => clearTimeout(timer);
}, [query]);

return (
  <View>
    <TextInput
      value={query}
      onChangeText={setQuery}
      placeholder="Search YouTube..."
    />
    {isSearching && <ActivityIndicator />}
    <FlatList
      data={results}
      renderItem={({ item }) => (
        <SongResultCard
          song={item}
          onAdd={() => addToQueue(item)}
        />
      )}
    />
  </View>
);
```

**Estimated Effort:** 8-10 hours

## What NOT to Copy from Jukebox

### ❌ Don't Copy: SQLite Database

**Why:** GrooveBox uses PostgreSQL + Redis (better for multi-user, real-time).

### ❌ Don't Copy: Knex Query Builder

**Why:** GrooveBox uses TypeORM (already set up with entities, migrations).

### ❌ Don't Copy: Express.js Patterns

**Why:** GrooveBox uses NestJS (different architecture with decorators, modules, DI).

### ❌ Don't Copy: REST-only API

**Why:** GrooveBox uses WebSockets for real-time (more efficient for live updates).

### ❌ Don't Copy: Position-based Queue

**Why:** GrooveBox already has vote-based queue (more democratic).

### ❌ Don't Copy: S3 Storage Pattern

**Why:** Streaming is better than downloading for GrooveBox's use case.

## Implementation Roadmap

### Phase 4A: YouTube Search (Week 1)
- [ ] Add YouTube API key to backend `.env`
- [ ] Create `youtube.controller.ts` and `youtube.service.ts` in `queue` module
- [ ] Implement `/queue/youtube/search` endpoint
- [ ] Create mobile `YouTubeSearchScreen.tsx`
- [ ] Implement debounced search UI
- [ ] Test search integration

**Deliverable:** Users can search YouTube and see results with thumbnails.

### Phase 4B: YouTube Metadata Extraction (Week 1-2)
- [ ] Implement `getVideoMetadata()` service method
- [ ] Update `submitSong()` to auto-populate metadata from YouTube URL
- [ ] Add YouTube video preview in submit form
- [ ] Test with various YouTube URLs

**Deliverable:** Submitting YouTube URL auto-fills song title, artist, thumbnail.

### Phase 4C: YouTube Playback Integration (Week 2-3)
- [ ] Research: Choose between iframe player vs stream URL extraction
- [ ] Implement chosen approach
- [ ] Test synchronized playback with YouTube audio
- [ ] Measure sync accuracy (<50ms target)
- [ ] Handle errors (deleted videos, region restrictions)

**Deliverable:** YouTube songs play in sync across all devices.

### Phase 4D: YouTube Health Worker (Week 3-4)
- [ ] Create background worker service
- [ ] Implement availability checking
- [ ] Set up cron schedule (every 6 hours)
- [ ] Add "unavailable" badge in UI for dead links
- [ ] Test with deleted/restricted videos

**Deliverable:** Queue shows which YouTube songs are no longer available.

## Code Reuse Strategy

### Can Directly Copy (with minimal changes):
1. YouTube API search logic (`index.ts:1623-1700`)
2. Duration parsing utilities
3. Video ID extraction from URLs
4. Search debouncing pattern

### Must Adapt (different frameworks):
1. Frontend components (React → React Native)
2. Database queries (Knex → TypeORM)
3. API endpoints (Express → NestJS)
4. Authentication (Fingerprint → JWT)

### Cannot Use (architectural mismatch):
1. SQLite setup
2. S3 download/storage workflow
3. Position-based queue algorithm
4. Anonymous user system

## Legal & Technical Considerations

### YouTube Terms of Service
- Extracting audio streams may violate YouTube TOS
- Consider official APIs: YouTube Music API, YouTube Player API
- Alternative: Spotify SDK (better licensing, but requires Premium)

### Rate Limiting
- YouTube API: 10,000 quota units/day (free tier)
- Search costs 100 units, video details costs 1 unit
- Budget: ~90 searches/day with free tier
- Consider caching popular search results

### Copyright
- Don't store YouTube audio files
- Don't modify audio (compression, format conversion)
- Provide attribution to original YouTube uploader
- Consider DMCA takedown procedures

## Conclusion

The reference jukebox app provides **valuable patterns for YouTube integration** but requires significant adaptation due to architectural differences. The highest-value adaptations are:

1. **YouTube search API** (can copy almost directly)
2. **Metadata extraction** (straightforward port)
3. **Search UI/UX patterns** (adapt to mobile)

The **download/storage workflow should NOT be copied** - streaming is more appropriate for GrooveBox's synchronized playback use case.

Estimated total effort for full YouTube integration: **3-4 weeks** (Phases 4A-4D combined).

## Next Steps

1. Set up YouTube API credentials (Google Cloud Console)
2. Start with Phase 4A (search endpoint)
3. Test search functionality on mobile app
4. Make decision on playback approach (iframe vs stream extraction vs alternative SDK)
5. Implement playback with synchronization
6. Add background health checking

---

**Document Version:** 1.0
**Last Updated:** 2024-11-24
**Author:** Claude Code Analysis
