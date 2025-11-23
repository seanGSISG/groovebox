# Voting-Based Queue System

## Overview

The groovebox voting-based queue system allows chat participants to submit YouTube song URLs and vote on submissions. The song with the most votes automatically plays when the current song ends.

## Features

- **Song Submission**: Any room member can submit YouTube URLs
- **Reddit-Style Voting**: Upvote/downvote submissions
- **Auto-Play**: Highest-voted song plays next automatically
- **Real-Time Updates**: Vote counts update instantly via WebSocket
- **Rate Limiting**: Max 5 submissions per user, 50 total per room

## Architecture

### Database Schema

**song_submissions**
- Tracks YouTube URLs submitted to the queue
- Stores vote counts and play history
- Soft-delete with `isActive` flag

**song_submission_votes**
- Individual votes for submissions
- Unique constraint prevents double-voting
- Cascades on submission deletion

### WebSocket Events

**Client → Server**
- `queue:submit` - Submit new YouTube URL
- `queue:vote` - Upvote a submission
- `queue:unvote` - Remove upvote
- `queue:remove` - Remove own submission
- `queue:get` - Fetch current queue state
- `playback:ended` - DJ signals song finished

**Server → Client**
- `queue:updated` - Broadcast when queue changes
- `queue:auto-play` - Notify clients of next song

### Business Logic

1. User submits YouTube URL (auto-upvoted)
2. Other users can upvote submissions
3. Queue sorted by vote count (DESC), then creation time (ASC)
4. When song ends, DJ signals `playback:ended`
5. Server finds top submission and broadcasts `queue:auto-play`
6. Submission marked as played (inactive)
7. Clients auto-load and play the YouTube video

## Usage

### Submitting a Song

1. Tap "Queue" tab in room
2. Tap "+" button
3. Enter YouTube URL (required)
4. Optionally add song title and artist
5. Tap "Submit Song"

### Voting

1. View queue list
2. Tap up arrow to upvote (turns purple when active)
3. Tap again to remove upvote

### Auto-Play

When a song ends:
- DJ client automatically notifies server
- Server selects top-voted submission
- All clients receive auto-play event
- Clients load and play YouTube video

## Rate Limits

- **Per User**: Maximum 5 active submissions
- **Per Room**: Maximum 50 active submissions
- **Duplicate Prevention**: Same URL cannot be submitted twice

## Future Enhancements

- YouTube metadata extraction (title, artist, thumbnail)
- Downvoting support
- Queue history and statistics
- Playlist import
- Spotify integration
