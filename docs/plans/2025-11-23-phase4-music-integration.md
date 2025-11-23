# Phase 4: Music Integration (Spotify SDK) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate Spotify SDK to enable real music playback with search, selection, and synchronized playback across all room members.

**Architecture:** Backend handles Spotify OAuth flow, token management, and track metadata. Frontend uses react-native-spotify-remote for native Spotify SDK integration with our existing sync logic. DJ searches and selects tracks, backend broadcasts playback commands with sync timestamps, all clients play via Spotify SDK.

**Tech Stack:** NestJS + Spotify Web API, React Native + react-native-spotify-remote, OAuth 2.0 PKCE flow, Redis for token caching

---

## Prerequisites

Before starting, ensure:
- Spotify Developer Account created
- App registered at https://developer.spotify.com/dashboard
- Redirect URI configured: `groovebox://spotify/callback`
- Client ID and Client Secret obtained
- All users have Spotify Premium accounts (required for SDK)

---

## Task 1: Backend - Spotify OAuth Module

**Goal:** Implement Spotify OAuth 2.0 flow with token management

**Files:**
- Create: `backend/src/spotify/spotify.module.ts`
- Create: `backend/src/spotify/spotify.service.ts`
- Create: `backend/src/spotify/spotify.controller.ts`
- Create: `backend/src/spotify/dto/spotify-auth.dto.ts`
- Create: `backend/src/spotify/dto/spotify-token.dto.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/.env.example`
- Create: `backend/src/spotify/spotify.service.spec.ts`

**Step 1: Install dependencies**

```bash
cd backend
npm install @nestjs/axios axios
npm install --save-dev @types/spotify-web-api-node
```

**Step 2: Add environment variables**

Add to `backend/.env.example`:
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=groovebox://spotify/callback
```

**Step 3: Create DTOs**

Create `backend/src/spotify/dto/spotify-auth.dto.ts`:
```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class SpotifyAuthDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  state: string;
}
```

Create `backend/src/spotify/dto/spotify-token.dto.ts`:
```typescript
export interface SpotifyTokenDto {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}
```

**Step 4: Create Spotify service with OAuth**

Create `backend/src/spotify/spotify.service.ts`:
```typescript
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { firstValueFrom } from 'rxjs';
import { SpotifyTokenDto } from './dto/spotify-token.dto';

@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tokenUrl = 'https://accounts.spotify.com/api/token';
  private readonly authorizeUrl = 'https://accounts.spotify.com/authorize';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.clientId = this.configService.get<string>('SPOTIFY_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('SPOTIFY_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('SPOTIFY_REDIRECT_URI');
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state: string): string {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state',
    ];

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state,
      scope: scopes.join(' '),
      show_dialog: 'true',
    });

    return `${this.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, userId: string): Promise<SpotifyTokenDto> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      });

      const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await firstValueFrom(
        this.httpService.post(this.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${authHeader}`,
          },
        }),
      );

      const { access_token, refresh_token, expires_in, scope } = response.data;

      const tokenDto: SpotifyTokenDto = {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + expires_in * 1000,
        scope,
      };

      // Store in Redis with userId key
      await this.storeToken(userId, tokenDto);

      return tokenDto;
    } catch (error) {
      this.logger.error(`Failed to exchange code for token: ${error.message}`);
      throw new UnauthorizedException('Failed to authenticate with Spotify');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(userId: string): Promise<SpotifyTokenDto> {
    const currentToken = await this.getToken(userId);
    if (!currentToken?.refreshToken) {
      throw new UnauthorizedException('No refresh token available');
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentToken.refreshToken,
      });

      const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await firstValueFrom(
        this.httpService.post(this.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${authHeader}`,
          },
        }),
      );

      const { access_token, expires_in, scope } = response.data;

      const tokenDto: SpotifyTokenDto = {
        accessToken: access_token,
        refreshToken: currentToken.refreshToken, // Keep existing refresh token
        expiresAt: Date.now() + expires_in * 1000,
        scope,
      };

      await this.storeToken(userId, tokenDto);

      return tokenDto;
    } catch (error) {
      this.logger.error(`Failed to refresh token: ${error.message}`);
      throw new UnauthorizedException('Failed to refresh Spotify token');
    }
  }

  /**
   * Get valid access token (refreshes if expired)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const token = await this.getToken(userId);
    if (!token) {
      throw new UnauthorizedException('No Spotify token found. Please authenticate.');
    }

    // Check if token is expired or expiring soon (within 5 minutes)
    if (token.expiresAt - Date.now() < 5 * 60 * 1000) {
      this.logger.log(`Token expiring soon for user ${userId}, refreshing...`);
      const refreshedToken = await this.refreshAccessToken(userId);
      return refreshedToken.accessToken;
    }

    return token.accessToken;
  }

  /**
   * Store token in Redis
   */
  private async storeToken(userId: string, token: SpotifyTokenDto): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `spotify:token:${userId}`;
    await redis.set(key, JSON.stringify(token), 'EX', 3600 * 24 * 30); // 30 days
  }

  /**
   * Get token from Redis
   */
  private async getToken(userId: string): Promise<SpotifyTokenDto | null> {
    const redis = this.redisService.getClient();
    const key = `spotify:token:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Check if user has valid Spotify authentication
   */
  async hasValidToken(userId: string): Promise<boolean> {
    const token = await this.getToken(userId);
    return !!token;
  }

  /**
   * Revoke Spotify access (logout)
   */
  async revokeAccess(userId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = `spotify:token:${userId}`;
    await redis.del(key);
  }
}
```

**Step 5: Create Spotify controller**

Create `backend/src/spotify/spotify.controller.ts`:
```typescript
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpotifyService } from './spotify.service';
import { SpotifyAuthDto } from './dto/spotify-auth.dto';

@Controller('spotify')
export class SpotifyController {
  constructor(private readonly spotifyService: SpotifyService) {}

  /**
   * GET /spotify/authorize
   * Returns authorization URL for user to authenticate with Spotify
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  getAuthorizationUrl(@Request() req): { url: string; state: string } {
    const state = `${req.user.userId}-${Date.now()}`; // Simple state parameter
    const url = this.spotifyService.getAuthorizationUrl(state);
    return { url, state };
  }

  /**
   * POST /spotify/callback
   * Handle OAuth callback with authorization code
   */
  @Post('callback')
  @UseGuards(JwtAuthGuard)
  async handleCallback(@Request() req, @Body() authDto: SpotifyAuthDto) {
    const userId = req.user.userId;

    // Verify state matches userId (basic CSRF protection)
    if (!authDto.state.startsWith(userId)) {
      throw new UnauthorizedException('Invalid state parameter');
    }

    const token = await this.spotifyService.exchangeCodeForToken(authDto.code, userId);

    return {
      success: true,
      expiresAt: token.expiresAt,
    };
  }

  /**
   * GET /spotify/status
   * Check if user has authenticated with Spotify
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getAuthStatus(@Request() req) {
    const hasToken = await this.spotifyService.hasValidToken(req.user.userId);
    return { authenticated: hasToken };
  }

  /**
   * POST /spotify/logout
   * Revoke Spotify access
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req) {
    await this.spotifyService.revokeAccess(req.user.userId);
    return { success: true };
  }
}
```

**Step 6: Create Spotify module**

Create `backend/src/spotify/spotify.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SpotifyService } from './spotify.service';
import { SpotifyController } from './spotify.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [HttpModule, ConfigModule, RedisModule],
  controllers: [SpotifyController],
  providers: [SpotifyService],
  exports: [SpotifyService],
})
export class SpotifyModule {}
```

**Step 7: Register module in AppModule**

Modify `backend/src/app.module.ts`:
```typescript
// Add to imports array
import { SpotifyModule } from './spotify/spotify.module';

@Module({
  imports: [
    // ... existing imports
    SpotifyModule,
  ],
  // ...
})
export class AppModule {}
```

**Step 8: Write tests**

Create `backend/src/spotify/spotify.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SpotifyService } from './spotify.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { of, throwError } from 'rxjs';
import { UnauthorizedException } from '@nestjs/common';

describe('SpotifyService', () => {
  let service: SpotifyService;
  let httpService: HttpService;
  let redisService: RedisService;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        SPOTIFY_CLIENT_ID: 'test_client_id',
        SPOTIFY_CLIENT_SECRET: 'test_client_secret',
        SPOTIFY_REDIRECT_URI: 'groovebox://spotify/callback',
      };
      return config[key];
    }),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpotifyService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SpotifyService>(SpotifyService);
    httpService = module.get<HttpService>(HttpService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const state = 'test-state-123';
      const url = service.getAuthorizationUrl(state);

      expect(url).toContain('https://accounts.spotify.com/authorize');
      expect(url).toContain('client_id=test_client_id');
      expect(url).toContain('redirect_uri=groovebox%3A%2F%2Fspotify%2Fcallback');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('scope=');
      expect(url).toContain('streaming');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockResponse = {
        data: {
          access_token: 'access_token_123',
          refresh_token: 'refresh_token_123',
          expires_in: 3600,
          scope: 'streaming user-read-private',
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.exchangeCodeForToken('auth_code_123', 'user_123');

      expect(result.accessToken).toBe('access_token_123');
      expect(result.refreshToken).toBe('refresh_token_123');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'spotify:token:user_123',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('should throw UnauthorizedException on failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Invalid code')),
      );

      await expect(
        service.exchangeCodeForToken('invalid_code', 'user_123'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getValidAccessToken', () => {
    it('should return token if not expired', async () => {
      const futureExpiry = Date.now() + 3600 * 1000;
      const mockToken = {
        accessToken: 'valid_token',
        refreshToken: 'refresh_token',
        expiresAt: futureExpiry,
        scope: 'streaming',
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockToken));

      const token = await service.getValidAccessToken('user_123');

      expect(token).toBe('valid_token');
    });

    it('should refresh token if expired', async () => {
      const pastExpiry = Date.now() - 1000;
      const mockOldToken = {
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        expiresAt: pastExpiry,
        scope: 'streaming',
      };

      const mockNewResponse = {
        data: {
          access_token: 'new_token',
          expires_in: 3600,
          scope: 'streaming',
        },
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockOldToken));
      mockHttpService.post.mockReturnValue(of(mockNewResponse));
      mockRedisClient.set.mockResolvedValue('OK');

      const token = await service.getValidAccessToken('user_123');

      expect(token).toBe('new_token');
      expect(mockHttpService.post).toHaveBeenCalled();
    });
  });

  describe('hasValidToken', () => {
    it('should return true if token exists', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ accessToken: 'token' }));

      const result = await service.hasValidToken('user_123');

      expect(result).toBe(true);
    });

    it('should return false if no token exists', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.hasValidToken('user_123');

      expect(result).toBe(false);
    });
  });
});
```

**Step 9: Run tests**

```bash
npm test -- spotify.service.spec.ts
```

Expected: All tests pass

**Step 10: Commit**

```bash
git add backend/src/spotify backend/src/app.module.ts backend/.env.example
git commit -m "feat: add Spotify OAuth module with token management"
```

---

## Task 2: Backend - Spotify Search & Track API

**Goal:** Implement track search and metadata retrieval from Spotify API

**Files:**
- Create: `backend/src/spotify/dto/track-search.dto.ts`
- Create: `backend/src/spotify/dto/track.dto.ts`
- Modify: `backend/src/spotify/spotify.service.ts`
- Modify: `backend/src/spotify/spotify.controller.ts`
- Create: `backend/src/spotify/spotify-api.service.spec.ts`

**Step 1: Create Track DTOs**

Create `backend/src/spotify/dto/track-search.dto.ts`:
```typescript
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TrackSearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}
```

Create `backend/src/spotify/dto/track.dto.ts`:
```typescript
export interface SpotifyArtistDto {
  id: string;
  name: string;
}

export interface SpotifyAlbumDto {
  id: string;
  name: string;
  images: Array<{ url: string; height: number; width: number }>;
}

export interface SpotifyTrackDto {
  id: string;
  uri: string;
  name: string;
  artists: SpotifyArtistDto[];
  album: SpotifyAlbumDto;
  durationMs: number;
  previewUrl: string | null;
  explicit: boolean;
}

export interface TrackSearchResultDto {
  tracks: SpotifyTrackDto[];
  total: number;
  limit: number;
  offset: number;
}
```

**Step 2: Add search methods to SpotifyService**

Modify `backend/src/spotify/spotify.service.ts`, add these methods:
```typescript
// Add to imports
import { TrackSearchDto } from './dto/track-search.dto';
import { SpotifyTrackDto, TrackSearchResultDto } from './dto/track.dto';

// Add these methods to SpotifyService class

/**
 * Search for tracks on Spotify
 */
async searchTracks(
  userId: string,
  searchDto: TrackSearchDto,
): Promise<TrackSearchResultDto> {
  const accessToken = await this.getValidAccessToken(userId);

  try {
    const params = new URLSearchParams({
      q: searchDto.query,
      type: 'track',
      limit: searchDto.limit.toString(),
      offset: searchDto.offset.toString(),
    });

    const response = await firstValueFrom(
      this.httpService.get(`https://api.spotify.com/v1/search?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );

    const tracks: SpotifyTrackDto[] = response.data.tracks.items.map((item: any) => ({
      id: item.id,
      uri: item.uri,
      name: item.name,
      artists: item.artists.map((artist: any) => ({
        id: artist.id,
        name: artist.name,
      })),
      album: {
        id: item.album.id,
        name: item.album.name,
        images: item.album.images,
      },
      durationMs: item.duration_ms,
      previewUrl: item.preview_url,
      explicit: item.explicit,
    }));

    return {
      tracks,
      total: response.data.tracks.total,
      limit: searchDto.limit,
      offset: searchDto.offset,
    };
  } catch (error) {
    this.logger.error(`Failed to search tracks: ${error.message}`);
    throw new Error('Failed to search Spotify tracks');
  }
}

/**
 * Get track details by ID
 */
async getTrack(userId: string, trackId: string): Promise<SpotifyTrackDto> {
  const accessToken = await this.getValidAccessToken(userId);

  try {
    const response = await firstValueFrom(
      this.httpService.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );

    const item = response.data;

    return {
      id: item.id,
      uri: item.uri,
      name: item.name,
      artists: item.artists.map((artist: any) => ({
        id: artist.id,
        name: artist.name,
      })),
      album: {
        id: item.album.id,
        name: item.album.name,
        images: item.album.images,
      },
      durationMs: item.duration_ms,
      previewUrl: item.preview_url,
      explicit: item.explicit,
    };
  } catch (error) {
    this.logger.error(`Failed to get track: ${error.message}`);
    throw new Error('Failed to get Spotify track');
  }
}
```

**Step 3: Add search endpoints to controller**

Modify `backend/src/spotify/spotify.controller.ts`, add these endpoints:
```typescript
// Add to imports
import { TrackSearchDto } from './dto/track-search.dto';

// Add these methods to SpotifyController class

/**
 * GET /spotify/search
 * Search for tracks
 */
@Get('search')
@UseGuards(JwtAuthGuard)
async searchTracks(@Request() req, @Query() searchDto: TrackSearchDto) {
  return this.spotifyService.searchTracks(req.user.userId, searchDto);
}

/**
 * GET /spotify/track/:id
 * Get track details
 */
@Get('track/:id')
@UseGuards(JwtAuthGuard)
async getTrack(@Request() req, @Param('id') trackId: string) {
  return this.spotifyService.getTrack(req.user.userId, trackId);
}
```

**Step 4: Write API tests**

Create `backend/src/spotify/spotify-api.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SpotifyService } from './spotify.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { of } from 'rxjs';

describe('SpotifyService - API', () => {
  let service: SpotifyService;
  let httpService: HttpService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => ({
      SPOTIFY_CLIENT_ID: 'test_id',
      SPOTIFY_CLIENT_SECRET: 'test_secret',
      SPOTIFY_REDIRECT_URI: 'test://callback',
    }[key])),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpotifyService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SpotifyService>(SpotifyService);
    httpService = module.get<HttpService>(HttpService);

    // Mock valid token
    const mockToken = {
      accessToken: 'valid_token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      scope: 'streaming',
    };
    mockRedisClient.get.mockResolvedValue(JSON.stringify(mockToken));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchTracks', () => {
    it('should search tracks successfully', async () => {
      const mockResponse = {
        data: {
          tracks: {
            items: [
              {
                id: 'track1',
                uri: 'spotify:track:track1',
                name: 'Test Song',
                artists: [{ id: 'artist1', name: 'Test Artist' }],
                album: {
                  id: 'album1',
                  name: 'Test Album',
                  images: [{ url: 'http://image.jpg', height: 640, width: 640 }],
                },
                duration_ms: 180000,
                preview_url: 'http://preview.mp3',
                explicit: false,
              },
            ],
            total: 1,
          },
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.searchTracks('user1', {
        query: 'test',
        limit: 20,
        offset: 0,
      });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].name).toBe('Test Song');
      expect(result.total).toBe(1);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('https://api.spotify.com/v1/search'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid_token' },
        }),
      );
    });
  });

  describe('getTrack', () => {
    it('should get track details successfully', async () => {
      const mockResponse = {
        data: {
          id: 'track1',
          uri: 'spotify:track:track1',
          name: 'Specific Song',
          artists: [{ id: 'artist1', name: 'Artist Name' }],
          album: {
            id: 'album1',
            name: 'Album Name',
            images: [{ url: 'http://image.jpg', height: 640, width: 640 }],
          },
          duration_ms: 200000,
          preview_url: null,
          explicit: true,
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getTrack('user1', 'track1');

      expect(result.name).toBe('Specific Song');
      expect(result.explicit).toBe(true);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/tracks/track1',
        expect.any(Object),
      );
    });
  });
});
```

**Step 5: Run tests**

```bash
npm test -- spotify-api.service.spec.ts
```

Expected: All tests pass

**Step 6: Test endpoints manually**

```bash
# Get auth URL
curl http://localhost:3000/spotify/authorize \
  -H "Authorization: Bearer <your_jwt>"

# After OAuth flow, search tracks
curl "http://localhost:3000/spotify/search?query=bohemian%20rhapsody" \
  -H "Authorization: Bearer <your_jwt>"
```

**Step 7: Commit**

```bash
git add backend/src/spotify
git commit -m "feat: add Spotify track search and metadata API"
```

---

## Task 3: Backend - Playback Integration with Spotify

**Goal:** Integrate Spotify track selection with existing playback system

**Files:**
- Create: `backend/src/spotify/dto/play-track.dto.ts`
- Modify: `backend/src/gateway/room.gateway.ts`
- Modify: `backend/src/gateway/dto/playback-events.dto.ts`
- Create: `backend/src/entities/track.entity.ts`
- Modify: `backend/src/database/database.module.ts`

**Step 1: Create Track entity**

Create `backend/src/entities/track.entity.ts`:
```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('tracks')
export class Track {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  spotifyId: string;

  @Column()
  spotifyUri: string;

  @Column()
  name: string;

  @Column('simple-array')
  artists: string[];

  @Column()
  albumName: string;

  @Column({ nullable: true })
  albumArtUrl: string;

  @Column()
  durationMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Step 2: Register Track entity**

Modify `backend/src/database/database.module.ts`:
```typescript
// Add to entities array
import { Track } from '../entities/track.entity';

TypeOrmModule.forRoot({
  // ...
  entities: [
    // ... existing entities
    Track,
  ],
  // ...
}),
```

**Step 3: Create PlayTrack DTO**

Create `backend/src/spotify/dto/play-track.dto.ts`:
```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class PlayTrackDto {
  @IsString()
  @IsNotEmpty()
  spotifyUri: string;

  @IsString()
  @IsNotEmpty()
  trackId: string;
}
```

**Step 4: Update playback event DTOs**

Modify `backend/src/gateway/dto/playback-events.dto.ts`:
```typescript
// Add new fields to existing PlaybackStartDto or create new one

export class SpotifyPlaybackStartDto {
  @IsString()
  @IsNotEmpty()
  spotifyUri: string;

  @IsString()
  @IsNotEmpty()
  trackId: string;
}
```

**Step 5: Add Spotify playback handler to gateway**

Modify `backend/src/gateway/room.gateway.ts`:
```typescript
// Add to imports
import { SpotifyService } from '../spotify/spotify.service';
import { SpotifyPlaybackStartDto } from './dto/playback-events.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Track } from '../entities/track.entity';

// Add to constructor
constructor(
  // ... existing injections
  private readonly spotifyService: SpotifyService,
  @InjectRepository(Track)
  private readonly trackRepository: Repository<Track>,
) {}

// Add new event handler
@SubscribeMessage('playback:start-spotify')
@UseGuards(WsJwtGuard)
async handleSpotifyPlaybackStart(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() dto: SpotifyPlaybackStartDto,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = client.data.room;

    if (!room) {
      throw new WsException('You are not in a room');
    }

    // Verify user is the current DJ
    const currentDj = await this.roomsService.getCurrentDj(room.id);
    if (!currentDj || currentDj.userId !== userId) {
      throw new WsException('Only the DJ can start playback');
    }

    // Get track details from Spotify
    const trackDetails = await this.spotifyService.getTrack(userId, dto.trackId);

    // Store track in database for history
    let track = await this.trackRepository.findOne({
      where: { spotifyId: trackDetails.id },
    });

    if (!track) {
      track = this.trackRepository.create({
        spotifyId: trackDetails.id,
        spotifyUri: trackDetails.uri,
        name: trackDetails.name,
        artists: trackDetails.artists.map(a => a.name),
        albumName: trackDetails.album.name,
        albumArtUrl: trackDetails.album.images[0]?.url,
        durationMs: trackDetails.durationMs,
      });
      await this.trackRepository.save(track);
    }

    // Calculate synchronized start time
    const maxRtt = await this.playbackSyncService.getMaxRttForRoom(room.id);
    const syncBuffer = Math.max(300, maxRtt * 2); // At least 300ms buffer
    const startAtServerTime = Date.now() + syncBuffer;

    // Prepare playback event
    const playbackEvent = {
      spotifyUri: trackDetails.uri,
      trackId: track.id,
      trackName: trackDetails.name,
      artists: trackDetails.artists.map(a => a.name),
      albumArt: trackDetails.album.images[0]?.url,
      durationMs: trackDetails.durationMs,
      startAtServerTime,
      serverTimestamp: Date.now(),
    };

    // Update Redis room state
    await this.redisService.getClient().hset(
      `room:${room.id}:state`,
      'playing',
      'true',
      'currentTrack',
      JSON.stringify({
        spotifyUri: trackDetails.uri,
        trackId: track.id,
        startedAt: startAtServerTime,
      }),
    );

    // Broadcast to all room members
    this.server.to(`room:${room.id}`).emit('playback:start', playbackEvent);

    this.logger.log(
      `Spotify playback started in room ${room.roomCode}: ${trackDetails.name}`,
    );
  } catch (error) {
    this.logger.error(`Spotify playback start error: ${error.message}`);
    throw new WsException(error.message);
  }
}
```

**Step 6: Update gateway module dependencies**

Modify `backend/src/gateway/room.gateway.ts` module imports:
```typescript
// Ensure SpotifyModule is imported
import { SpotifyModule } from '../spotify/spotify.module';

// In the module decorator
@Module({
  imports: [
    // ... existing imports
    SpotifyModule,
    TypeOrmModule.forFeature([Track]),
  ],
  // ...
})
```

**Step 7: Create migration**

```bash
cd backend
npm run migration:generate -- src/database/migrations/AddTrackEntity
npm run migration:run
```

**Step 8: Test playback integration**

Use a WebSocket client to test:
```javascript
socket.emit('playback:start-spotify', {
  spotifyUri: 'spotify:track:3n3Ppam7vgaVa1iaRUc9Lp', // Mr. Brightside
  trackId: '3n3Ppam7vgaVa1iaRUc9Lp'
});

// Listen for response
socket.on('playback:start', (data) => {
  console.log('Playback started:', data);
});
```

**Step 9: Commit**

```bash
git add backend/src/gateway backend/src/entities backend/src/database
git commit -m "feat: integrate Spotify playback with sync system"
```

---

## Task 4: Frontend - Spotify SDK Setup

**Goal:** Install and configure react-native-spotify-remote for iOS and Android

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/ios/Podfile`
- Create: `mobile/ios/GrooveBox/Info.plist` (update)
- Modify: `mobile/android/app/build.gradle`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`
- Create: `mobile/src/services/SpotifyService.ts`

**Step 1: Install Spotify SDK**

```bash
cd mobile
npm install react-native-spotify-remote
cd ios && pod install && cd ..
```

**Step 2: Configure iOS**

Update `mobile/ios/GrooveBox/Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>groovebox</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>groovebox</string>
    </array>
  </dict>
</array>
```

Update `mobile/ios/Podfile`:
```ruby
# Add to the target
pod 'SpotifyiOS', '~> 1.2.2'
```

Run:
```bash
cd ios && pod install && cd ..
```

**Step 3: Configure Android**

Update `mobile/android/app/build.gradle`:
```gradle
dependencies {
    // ... existing dependencies
    implementation 'com.spotify.android:auth:1.2.5'
}
```

Update `mobile/android/app/src/main/AndroidManifest.xml`:
```xml
<application>
  <!-- ... existing config ... -->

  <activity
    android:name="com.spotify.sdk.android.authentication.LoginActivity"
    android:theme="@android:style/Theme.Translucent.NoTitleBar" />

  <activity android:name=".SpotifyActivity">
    <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data
        android:host="spotify"
        android:scheme="groovebox" />
    </intent-filter>
  </activity>
</application>
```

**Step 4: Create Spotify Service wrapper**

Create `mobile/src/services/SpotifyService.ts`:
```typescript
import SpotifyRemote from 'react-native-spotify-remote';
import { Platform } from 'react-native';

export interface SpotifyConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export class SpotifyService {
  private static instance: SpotifyService;
  private isConnected = false;
  private config: SpotifyConfig;

  private constructor(config: SpotifyConfig) {
    this.config = config;
  }

  static getInstance(config?: SpotifyConfig): SpotifyService {
    if (!SpotifyService.instance) {
      if (!config) {
        throw new Error('SpotifyService must be initialized with config first');
      }
      SpotifyService.instance = new SpotifyService(config);
    }
    return SpotifyService.instance;
  }

  /**
   * Connect to Spotify Remote
   */
  async connect(): Promise<boolean> {
    try {
      const session = await SpotifyRemote.connect({
        clientId: this.config.clientId,
        redirectURL: this.config.redirectUri,
        scopes: this.config.scopes,
        showDialog: false,
      });

      this.isConnected = true;
      console.log('[Spotify] Connected:', session);
      return true;
    } catch (error) {
      console.error('[Spotify] Connection failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check if connected to Spotify
   */
  async isRemoteConnected(): Promise<boolean> {
    try {
      return await SpotifyRemote.isConnectedAsync();
    } catch (error) {
      return false;
    }
  }

  /**
   * Disconnect from Spotify Remote
   */
  async disconnect(): Promise<void> {
    try {
      await SpotifyRemote.disconnect();
      this.isConnected = false;
      console.log('[Spotify] Disconnected');
    } catch (error) {
      console.error('[Spotify] Disconnect error:', error);
    }
  }

  /**
   * Play track by Spotify URI
   */
  async playTrack(spotifyUri: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to Spotify. Call connect() first.');
    }

    try {
      await SpotifyRemote.playUri(spotifyUri);
      console.log(`[Spotify] Playing: ${spotifyUri}`);
    } catch (error) {
      console.error('[Spotify] Play error:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    try {
      await SpotifyRemote.pause();
      console.log('[Spotify] Paused');
    } catch (error) {
      console.error('[Spotify] Pause error:', error);
      throw error;
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    try {
      await SpotifyRemote.resume();
      console.log('[Spotify] Resumed');
    } catch (error) {
      console.error('[Spotify] Resume error:', error);
      throw error;
    }
  }

  /**
   * Seek to position in milliseconds
   */
  async seek(positionMs: number): Promise<void> {
    try {
      await SpotifyRemote.seek(positionMs);
      console.log(`[Spotify] Seeked to ${positionMs}ms`);
    } catch (error) {
      console.error('[Spotify] Seek error:', error);
      throw error;
    }
  }

  /**
   * Get current playback state
   */
  async getPlaybackState(): Promise<any> {
    try {
      const state = await SpotifyRemote.getPlayerState();
      return state;
    } catch (error) {
      console.error('[Spotify] Get state error:', error);
      throw error;
    }
  }
}
```

**Step 5: Add Spotify config to environment**

Create `mobile/src/config/spotify.ts`:
```typescript
export const SPOTIFY_CONFIG = {
  clientId: 'YOUR_SPOTIFY_CLIENT_ID', // Replace with your client ID
  redirectUri: 'groovebox://spotify/callback',
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
  ],
};
```

**Step 6: Test Spotify connection**

Create a test screen or add to existing:
```typescript
import { SpotifyService } from '../services/SpotifyService';
import { SPOTIFY_CONFIG } from '../config/spotify';

const TestSpotify = () => {
  const testConnect = async () => {
    const spotify = SpotifyService.getInstance(SPOTIFY_CONFIG);
    const connected = await spotify.connect();
    console.log('Spotify connected:', connected);
  };

  return (
    <Button title="Test Spotify Connect" onPress={testConnect} />
  );
};
```

**Step 7: Build and test on device**

```bash
# iOS
npx react-native run-ios --device

# Android
npx react-native run-android
```

Note: Spotify SDK requires physical device, won't work on simulators

**Step 8: Commit**

```bash
git add mobile/package.json mobile/ios mobile/android mobile/src/services mobile/src/config
git commit -m "feat: setup Spotify SDK for iOS and Android"
```

---

## Task 5: Frontend - Spotify Authentication Flow

**Goal:** Implement OAuth flow and token management on frontend

**Files:**
- Create: `mobile/src/contexts/SpotifyContext.tsx`
- Create: `mobile/src/screens/SpotifyAuthScreen.tsx`
- Modify: `mobile/src/navigation/AppNavigator.tsx`
- Create: `mobile/src/types/spotify.types.ts`

**Step 1: Create Spotify types**

Create `mobile/src/types/spotify.types.ts`:
```typescript
export interface SpotifyAuthStatus {
  authenticated: boolean;
  expiresAt?: number;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  durationMs: number;
  previewUrl: string | null;
  explicit: boolean;
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  total: number;
  limit: number;
  offset: number;
}
```

**Step 2: Create Spotify Context**

Create `mobile/src/contexts/SpotifyContext.tsx`:
```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotifyService } from '../services/SpotifyService';
import { SPOTIFY_CONFIG } from '../config/spotify';
import { API_URL } from '../config/api';

interface SpotifyContextType {
  isAuthenticated: boolean;
  isConnected: boolean;
  authUrl: string | null;
  loading: boolean;
  authenticate: () => Promise<void>;
  handleCallback: (url: string) => Promise<void>;
  disconnect: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const SpotifyContext = createContext<SpotifyContextType | undefined>(undefined);

interface SpotifyProviderProps {
  children: React.ReactNode;
  authToken: string | null;
}

export const SpotifyProvider: React.FC<SpotifyProviderProps> = ({ children, authToken }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingState, setPendingState] = useState<string | null>(null);

  // Initialize Spotify service
  const spotifyService = SpotifyService.getInstance(SPOTIFY_CONFIG);

  useEffect(() => {
    checkAuthStatus();
    setupDeepLinking();
  }, []);

  const setupDeepLinking = () => {
    // Handle deep link when app is already open
    Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('groovebox://spotify/callback')) {
        handleCallback(url);
      }
    });

    // Handle deep link when app opens from link
    Linking.getInitialURL().then((url) => {
      if (url && url.startsWith('groovebox://spotify/callback')) {
        handleCallback(url);
      }
    });
  };

  const checkAuthStatus = async () => {
    try {
      if (!authToken) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_URL}/spotify/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setIsAuthenticated(response.data.authenticated);

      // If authenticated with backend, try to connect Spotify Remote
      if (response.data.authenticated) {
        const connected = await spotifyService.isRemoteConnected();
        if (!connected) {
          await spotifyService.connect();
        }
        setIsConnected(true);
      }
    } catch (error) {
      console.error('[SpotifyContext] Auth status check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const authenticate = async () => {
    try {
      if (!authToken) {
        throw new Error('User not logged in');
      }

      // Get authorization URL from backend
      const response = await axios.get(`${API_URL}/spotify/authorize`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const { url, state } = response.data;
      setAuthUrl(url);
      setPendingState(state);

      // Open Spotify auth in browser
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        throw new Error('Cannot open Spotify authorization URL');
      }
    } catch (error) {
      console.error('[SpotifyContext] Authentication failed:', error);
      throw error;
    }
  };

  const handleCallback = async (url: string) => {
    try {
      console.log('[SpotifyContext] Handling callback:', url);

      // Parse callback URL
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');
      const error = urlObj.searchParams.get('error');

      if (error) {
        throw new Error(`Spotify auth error: ${error}`);
      }

      if (!code || !state) {
        throw new Error('Missing code or state in callback');
      }

      if (state !== pendingState) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      // Exchange code for token on backend
      await axios.post(
        `${API_URL}/spotify/callback`,
        { code, state },
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      setIsAuthenticated(true);
      setPendingState(null);

      // Connect to Spotify Remote
      const connected = await spotifyService.connect();
      setIsConnected(connected);

      console.log('[SpotifyContext] Authentication successful');
    } catch (error) {
      console.error('[SpotifyContext] Callback handling failed:', error);
      throw error;
    }
  };

  const disconnect = async () => {
    try {
      if (!authToken) return;

      // Revoke on backend
      await axios.post(
        `${API_URL}/spotify/logout`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      // Disconnect from Spotify Remote
      await spotifyService.disconnect();

      setIsAuthenticated(false);
      setIsConnected(false);
      console.log('[SpotifyContext] Disconnected from Spotify');
    } catch (error) {
      console.error('[SpotifyContext] Disconnect failed:', error);
    }
  };

  return (
    <SpotifyContext.Provider
      value={{
        isAuthenticated,
        isConnected,
        authUrl,
        loading,
        authenticate,
        handleCallback,
        disconnect,
        checkAuthStatus,
      }}
    >
      {children}
    </SpotifyContext.Provider>
  );
};

export const useSpotify = (): SpotifyContextType => {
  const context = useContext(SpotifyContext);
  if (!context) {
    throw new Error('useSpotify must be used within SpotifyProvider');
  }
  return context;
};
```

**Step 3: Create Spotify Auth Screen**

Create `mobile/src/screens/SpotifyAuthScreen.tsx`:
```typescript
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSpotify } from '../contexts/SpotifyContext';

export const SpotifyAuthScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { isAuthenticated, isConnected, loading, authenticate, disconnect } = useSpotify();

  useEffect(() => {
    if (isAuthenticated && isConnected) {
      // Redirect back to previous screen or room
      navigation.goBack();
    }
  }, [isAuthenticated, isConnected]);

  const handleConnect = async () => {
    try {
      await authenticate();
    } catch (error) {
      Alert.alert('Authentication Failed', 'Could not connect to Spotify. Please try again.');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      Alert.alert('Disconnect Failed', 'Could not disconnect from Spotify.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1DB954" />
        <Text style={styles.loadingText}>Checking Spotify connection...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Spotify Integration</Text>
        <Text style={styles.subtitle}>
          Connect your Spotify Premium account to play music
        </Text>
      </View>

      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Backend Auth:</Text>
          <View style={[styles.statusIndicator, isAuthenticated && styles.statusActive]} />
          <Text style={styles.statusText}>{isAuthenticated ? 'Connected' : 'Not Connected'}</Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Spotify Remote:</Text>
          <View style={[styles.statusIndicator, isConnected && styles.statusActive]} />
          <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Not Connected'}</Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Requirements:</Text>
        <Text style={styles.infoText}>• Spotify Premium account</Text>
        <Text style={styles.infoText}>• Spotify app installed on device</Text>
        <Text style={styles.infoText}>• Active internet connection</Text>
      </View>

      <View style={styles.actions}>
        {!isAuthenticated ? (
          <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
            <Text style={styles.connectButtonText}>Connect to Spotify</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>Back to Room</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#111',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusLabel: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#666',
    marginRight: 8,
  },
  statusActive: {
    backgroundColor: '#1DB954',
  },
  statusText: {
    color: '#ccc',
    fontSize: 14,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  infoText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 5,
  },
  actions: {
    gap: 15,
  },
  connectButton: {
    backgroundColor: '#1DB954',
    padding: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disconnectButton: {
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  disconnectButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  backButton: {
    backgroundColor: '#1DB954',
    padding: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    color: '#ccc',
    marginTop: 15,
    fontSize: 16,
  },
});
```

**Step 4: Update App Navigator**

Modify `mobile/src/navigation/AppNavigator.tsx`:
```typescript
// Add to imports
import { SpotifyAuthScreen } from '../screens/SpotifyAuthScreen';

// Add to Stack Navigator
<Stack.Screen
  name="SpotifyAuth"
  component={SpotifyAuthScreen}
  options={{ title: 'Connect Spotify' }}
/>
```

**Step 5: Wrap app with SpotifyProvider**

Update `App.tsx` or main navigation wrapper:
```typescript
import { SpotifyProvider } from './src/contexts/SpotifyContext';
import { useAuth } from './src/contexts/AuthContext';

function App() {
  const { token } = useAuth();

  return (
    <SpotifyProvider authToken={token}>
      {/* Your navigation */}
    </SpotifyProvider>
  );
}
```

**Step 6: Test authentication flow**

1. Navigate to SpotifyAuthScreen
2. Tap "Connect to Spotify"
3. Complete OAuth in browser
4. Verify redirect back to app
5. Check both status indicators show "Connected"

**Step 7: Commit**

```bash
git add mobile/src/contexts mobile/src/screens mobile/src/types mobile/src/navigation
git commit -m "feat: implement Spotify OAuth flow on frontend"
```

---

## Task 6: Frontend - Track Search UI

**Goal:** Create track search screen with Spotify API integration

**Files:**
- Create: `mobile/src/screens/TrackSearchScreen.tsx`
- Create: `mobile/src/components/TrackListItem.tsx`
- Modify: `mobile/src/navigation/AppNavigator.tsx`
- Modify: `mobile/src/screens/RoomScreen.tsx`

**Step 1: Create TrackListItem component**

Create `mobile/src/components/TrackListItem.tsx`:
```typescript
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { SpotifyTrack } from '../types/spotify.types';

interface TrackListItemProps {
  track: SpotifyTrack;
  onPress: (track: SpotifyTrack) => void;
  showAlbumArt?: boolean;
}

export const TrackListItem: React.FC<TrackListItemProps> = ({
  track,
  onPress,
  showAlbumArt = true,
}) => {
  const albumArt = track.album.images[0]?.url;
  const artistNames = track.artists.map((a) => a.name).join(', ');
  const durationMinutes = Math.floor(track.durationMs / 60000);
  const durationSeconds = Math.floor((track.durationMs % 60000) / 1000);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(track)}>
      {showAlbumArt && albumArt && (
        <Image source={{ uri: albumArt }} style={styles.albumArt} />
      )}
      <View style={styles.info}>
        <Text style={styles.trackName} numberOfLines={1}>
          {track.name}
        </Text>
        <Text style={styles.artistName} numberOfLines={1}>
          {artistNames}
        </Text>
        <Text style={styles.albumName} numberOfLines={1}>
          {track.album.name}
        </Text>
      </View>
      <Text style={styles.duration}>
        {durationMinutes}:{durationSeconds.toString().padStart(2, '0')}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    alignItems: 'center',
  },
  albumArt: {
    width: 60,
    height: 60,
    borderRadius: 4,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  trackName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  artistName: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 2,
  },
  albumName: {
    color: '#888',
    fontSize: 12,
  },
  duration: {
    color: '#888',
    fontSize: 14,
    marginLeft: 12,
  },
});
```

**Step 2: Create TrackSearchScreen**

Create `mobile/src/screens/TrackSearchScreen.tsx`:
```typescript
import React, { useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  Alert,
} from 'react-native';
import axios from 'axios';
import { API_URL } from '../config/api';
import { SpotifyTrack, SpotifySearchResult } from '../types/spotify.types';
import { TrackListItem } from '../components/TrackListItem';
import { useAuth } from '../contexts/AuthContext';

export const TrackSearchScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { token } = useAuth();
  const { onTrackSelect, roomCode } = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const searchTracks = async (query: string) => {
    if (!query.trim()) {
      setTracks([]);
      setSearchPerformed(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get<SpotifySearchResult>(
        `${API_URL}/spotify/search`,
        {
          params: { query, limit: 30 },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setTracks(response.data.tracks);
      setSearchPerformed(true);
    } catch (error) {
      console.error('[TrackSearch] Search failed:', error);
      Alert.alert('Search Failed', 'Could not search tracks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSelect = (track: SpotifyTrack) => {
    // Call the callback passed from RoomScreen
    onTrackSelect(track);
    navigation.goBack();
  };

  const handleSearch = () => {
    searchTracks(searchQuery);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for songs, artists, albums..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1DB954" />
        </View>
      )}

      {!loading && searchPerformed && tracks.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No tracks found</Text>
          <Text style={styles.emptySubtext}>Try a different search query</Text>
        </View>
      )}

      {!loading && !searchPerformed && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🎵</Text>
          <Text style={styles.emptySubtext}>Search for music to play</Text>
        </View>
      )}

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrackListItem track={item} onPress={handleTrackSelect} />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#fff',
    fontSize: 48,
    marginBottom: 10,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
});
```

**Step 3: Add TrackSearchScreen to navigator**

Modify `mobile/src/navigation/AppNavigator.tsx`:
```typescript
import { TrackSearchScreen } from '../screens/TrackSearchScreen';

// Add to Stack Navigator
<Stack.Screen
  name="TrackSearch"
  component={TrackSearchScreen}
  options={{ title: 'Search Music' }}
/>
```

**Step 4: Add search button to RoomScreen**

Modify `mobile/src/screens/RoomScreen.tsx`:
```typescript
// Add to DJ controls section (only visible when user is DJ)
const navigateToTrackSearch = () => {
  navigation.navigate('TrackSearch', {
    roomCode,
    onTrackSelect: handleTrackSelect,
  });
};

const handleTrackSelect = (track: SpotifyTrack) => {
  console.log('[Room] Track selected:', track);
  // We'll implement playback in next task
  Alert.alert('Track Selected', `${track.name} by ${track.artists[0].name}`);
};

// Add button in render (only for DJ)
{isDj && (
  <TouchableOpacity style={styles.searchButton} onPress={navigateToTrackSearch}>
    <Text style={styles.searchButtonText}>🔍 Search Music</Text>
  </TouchableOpacity>
)}
```

**Step 5: Test search functionality**

1. Navigate to room as DJ
2. Tap "Search Music" button
3. Search for "bohemian rhapsody"
4. Verify results display correctly
5. Tap a track to select it

**Step 6: Commit**

```bash
git add mobile/src/screens mobile/src/components mobile/src/navigation
git commit -m "feat: add Spotify track search UI"
```

---

## Task 7: Frontend - Synchronized Spotify Playback

**Goal:** Integrate Spotify playback with existing sync system

**Files:**
- Modify: `mobile/src/services/SyncedAudioPlayer.ts`
- Create: `mobile/src/services/SpotifyPlayer.ts`
- Modify: `mobile/src/screens/RoomScreen.tsx`

**Step 1: Create SpotifyPlayer wrapper**

Create `mobile/src/services/SpotifyPlayer.ts`:
```typescript
import { SpotifyService } from './SpotifyService';
import { ClockSyncManager } from './ClockSyncManager';

export class SpotifyPlayer {
  private spotifyService: SpotifyService;
  private syncManager: ClockSyncManager;
  private syncCheckInterval: NodeJS.Timeout | null = null;
  private currentTrackUri: string | null = null;
  private startAtServerTime: number | null = null;
  private durationMs: number = 0;

  constructor(spotifyService: SpotifyService, syncManager: ClockSyncManager) {
    this.spotifyService = spotifyService;
    this.syncManager = syncManager;
  }

  /**
   * Handle playback start with sync
   */
  async handlePlaybackStart(event: {
    spotifyUri: string;
    trackName: string;
    artists: string[];
    durationMs: number;
    startAtServerTime: number;
    serverTimestamp: number;
  }): Promise<void> {
    try {
      console.log('[SpotifyPlayer] Handling playback start:', event.trackName);

      this.currentTrackUri = event.spotifyUri;
      this.startAtServerTime = event.startAtServerTime;
      this.durationMs = event.durationMs;

      // Convert server time to local time
      const localStartTime = this.syncManager.serverTimeToLocal(event.startAtServerTime);
      const now = Date.now();
      const delayMs = localStartTime - now;

      console.log(`[SpotifyPlayer] Server start: ${event.startAtServerTime}`);
      console.log(`[SpotifyPlayer] Local start: ${localStartTime}`);
      console.log(`[SpotifyPlayer] Delay: ${delayMs}ms`);

      if (delayMs > 100) {
        // Future start - schedule playback
        console.log(`[SpotifyPlayer] Scheduling playback in ${delayMs}ms`);
        setTimeout(async () => {
          await this.spotifyService.playTrack(event.spotifyUri);
          this.startDriftCorrection();
        }, delayMs);
      } else if (delayMs < -500) {
        // Past start - calculate catch-up position
        const elapsedMs = Math.abs(delayMs);
        console.log(`[SpotifyPlayer] Catching up, elapsed: ${elapsedMs}ms`);

        await this.spotifyService.playTrack(event.spotifyUri);

        // Seek to current position
        if (elapsedMs < event.durationMs) {
          await this.spotifyService.seek(elapsedMs);
        }

        this.startDriftCorrection();
      } else {
        // Start immediately
        console.log('[SpotifyPlayer] Starting playback immediately');
        await this.spotifyService.playTrack(event.spotifyUri);
        this.startDriftCorrection();
      }
    } catch (error) {
      console.error('[SpotifyPlayer] Playback start error:', error);
      throw error;
    }
  }

  /**
   * Handle playback pause
   */
  async handlePlaybackPause(): Promise<void> {
    try {
      await this.spotifyService.pause();
      this.stopDriftCorrection();
      console.log('[SpotifyPlayer] Playback paused');
    } catch (error) {
      console.error('[SpotifyPlayer] Pause error:', error);
    }
  }

  /**
   * Handle playback stop
   */
  async handlePlaybackStop(): Promise<void> {
    try {
      await this.spotifyService.pause();
      this.stopDriftCorrection();
      this.currentTrackUri = null;
      this.startAtServerTime = null;
      console.log('[SpotifyPlayer] Playback stopped');
    } catch (error) {
      console.error('[SpotifyPlayer] Stop error:', error);
    }
  }

  /**
   * Start drift correction loop
   */
  private startDriftCorrection(): void {
    this.stopDriftCorrection(); // Clear any existing interval

    this.syncCheckInterval = setInterval(async () => {
      await this.checkAndCorrectDrift();
    }, 5000); // Check every 5 seconds

    console.log('[SpotifyPlayer] Drift correction started');
  }

  /**
   * Stop drift correction loop
   */
  private stopDriftCorrection(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
      console.log('[SpotifyPlayer] Drift correction stopped');
    }
  }

  /**
   * Check and correct drift
   */
  private async checkAndCorrectDrift(): Promise<void> {
    if (!this.startAtServerTime) return;

    try {
      // Get current playback state from Spotify
      const state = await this.spotifyService.getPlaybackState();

      if (!state.isPaused && state.track.uri === this.currentTrackUri) {
        const actualPositionMs = state.playbackPosition;

        // Calculate expected position
        const serverNow = this.syncManager.localTimeToServer(Date.now());
        const expectedPositionMs = serverNow - this.startAtServerTime;

        const driftMs = actualPositionMs - expectedPositionMs;

        console.log(`[SpotifyPlayer] Drift check: ${driftMs}ms`);

        // Correct if drift > 200ms
        if (Math.abs(driftMs) > 200) {
          console.log(`[SpotifyPlayer] Correcting drift: ${driftMs}ms`);
          await this.spotifyService.seek(expectedPositionMs);
        }
      }
    } catch (error) {
      console.error('[SpotifyPlayer] Drift check error:', error);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopDriftCorrection();
  }
}
```

**Step 2: Update RoomScreen with Spotify playback**

Modify `mobile/src/screens/RoomScreen.tsx`:
```typescript
// Add to imports
import { SpotifyPlayer } from '../services/SpotifyPlayer';
import { SpotifyService } from '../services/SpotifyService';
import { SPOTIFY_CONFIG } from '../config/spotify';
import { useSpotify } from '../contexts/SpotifyContext';

// Add to component
const RoomContent: React.FC<{...}> = ({ roomCode, navigation, socket, user }) => {
  // ... existing state ...
  const spotifyPlayerRef = useRef<SpotifyPlayer | null>(null);
  const { isConnected: spotifyConnected } = useSpotify();

  useEffect(() => {
    if (!socket) return;

    // Initialize Spotify player
    if (spotifyConnected && syncManagerRef.current) {
      const spotifyService = SpotifyService.getInstance(SPOTIFY_CONFIG);
      spotifyPlayerRef.current = new SpotifyPlayer(
        spotifyService,
        syncManagerRef.current,
      );
    }

    // Listen for Spotify playback events
    socket.on('playback:start', async (event) => {
      console.log('[Room] Playback start event:', event);

      if (event.spotifyUri && spotifyPlayerRef.current) {
        try {
          await spotifyPlayerRef.current.handlePlaybackStart(event);
          setIsPlaying(true);
          syncManagerRef.current?.startSync(true); // Increase sync frequency
        } catch (error) {
          console.error('[Room] Playback start failed:', error);
          Alert.alert('Playback Error', 'Failed to start Spotify playback');
        }
      }
    });

    socket.on('playback:pause', async () => {
      if (spotifyPlayerRef.current) {
        await spotifyPlayerRef.current.handlePlaybackPause();
        setIsPlaying(false);
        syncManagerRef.current?.startSync(false);
      }
    });

    socket.on('playback:stop', async () => {
      if (spotifyPlayerRef.current) {
        await spotifyPlayerRef.current.handlePlaybackStop();
        setIsPlaying(false);
      }
    });

    return () => {
      socket.off('playback:start');
      socket.off('playback:pause');
      socket.off('playback:stop');
    };
  }, [socket, spotifyConnected]);

  // Update track selection handler
  const handleTrackSelect = (track: SpotifyTrack) => {
    if (!socket) return;

    console.log('[Room] Emitting Spotify playback:', track.name);
    socket.emit('playback:start-spotify', {
      spotifyUri: track.uri,
      trackId: track.id,
    });
  };

  // Add Spotify connection check for DJ
  const canPlayMusic = isDj && spotifyConnected;

  // Update search button to show connection status
  return (
    <View style={styles.container}>
      {/* ... existing UI ... */}

      {isDj && (
        <View style={styles.djControls}>
          {!spotifyConnected && (
            <TouchableOpacity
              style={styles.spotifyConnectButton}
              onPress={() => navigation.navigate('SpotifyAuth')}
            >
              <Text style={styles.spotifyConnectText}>
                Connect Spotify to Play Music
              </Text>
            </TouchableOpacity>
          )}

          {canPlayMusic && (
            <TouchableOpacity
              style={styles.searchButton}
              onPress={navigateToTrackSearch}
            >
              <Text style={styles.searchButtonText}>🔍 Search Music</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ... rest of UI ... */}
    </View>
  );
};
```

**Step 3: Add missing ClockSyncManager methods**

Ensure `mobile/src/services/ClockSyncManager.ts` has:
```typescript
/**
 * Convert local time to server time
 */
localTimeToServer(localTime: number): number {
  return localTime + this.clockOffset;
}
```

**Step 4: Test synchronized playback**

1. Two devices join same room
2. DJ connects Spotify on both devices
3. DJ searches and selects track
4. Verify both devices play in sync (<50ms drift)
5. Test pause/resume
6. Test drift correction after 5+ minutes

**Step 5: Commit**

```bash
git add mobile/src/services mobile/src/screens
git commit -m "feat: integrate synchronized Spotify playback"
```

---

## Task 8: Testing & Documentation

**Goal:** Create comprehensive tests and documentation

**Files:**
- Create: `docs/spotify-integration.md`
- Create: `backend/test/spotify-integration.e2e-spec.ts`
- Update: `README.md`

**Step 1: Create documentation**

Create `docs/spotify-integration.md`:
```markdown
# Spotify Integration Guide

## Overview

GrooveBox integrates with Spotify to provide synchronized music playback across all room members. This guide covers setup, usage, and troubleshooting.

## Requirements

- Spotify Premium account (required for Spotify SDK)
- Spotify app installed on mobile device
- Spotify Developer account for app registration

## Backend Setup

### 1. Register Spotify App

1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Add redirect URI: `groovebox://spotify/callback`
4. Note Client ID and Client Secret

### 2. Configure Environment

Add to `backend/.env`:
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=groovebox://spotify/callback
```

### 3. API Endpoints

#### Authentication
- `GET /spotify/authorize` - Get OAuth URL
- `POST /spotify/callback` - Handle OAuth callback
- `GET /spotify/status` - Check auth status
- `POST /spotify/logout` - Revoke access

#### Music
- `GET /spotify/search?query=<q>` - Search tracks
- `GET /spotify/track/:id` - Get track details

#### WebSocket Events
- `playback:start-spotify` - Start Spotify playback (DJ only)

## Frontend Setup

### 1. iOS Configuration

Update `ios/GrooveBox/Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>groovebox</string>
    </array>
  </dict>
</array>
```

### 2. Android Configuration

Update `android/app/src/main/AndroidManifest.xml`:
```xml
<activity android:name=".SpotifyActivity">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:host="spotify" android:scheme="groovebox" />
  </intent-filter>
</activity>
```

## User Flow

### DJ Flow

1. Join room and become DJ
2. Navigate to "Connect Spotify"
3. Authenticate with Spotify
4. Search for tracks
5. Select track to play
6. All room members hear synchronized playback

### Listener Flow

1. Join room
2. Connect Spotify (required for playback)
3. Listen to DJ's music selection
4. Synchronized playback automatically

## Architecture

### Token Management
- Access tokens stored in Redis with userId key
- Automatic refresh when token expires (1 hour)
- 30-day refresh token expiration

### Synchronization
- Backend calculates `startAtServerTime` with sync buffer
- Frontend converts to local time using clock offset
- Drift correction every 5 seconds
- Target: <50ms sync accuracy

### Playback Flow
1. DJ selects track via search
2. Backend fetches track metadata from Spotify API
3. Backend stores track in database
4. Backend calculates sync time
5. Backend broadcasts to all room members
6. Each client:
   - Connects to Spotify SDK
   - Schedules playback at calculated local time
   - Starts drift correction loop

## Troubleshooting

### "Not connected to Spotify"
- Ensure Spotify Premium account
- Install Spotify app on device
- Complete authentication flow
- Check network connection

### Playback doesn't start
- Verify Spotify app is installed and logged in
- Check that track is available in user's region
- Ensure device has active internet connection
- Try disconnecting and reconnecting Spotify

### Devices out of sync
- Check RTT values (should be <100ms)
- Verify clock sync is running
- Check for network instability
- Restart drift correction by pausing/resuming

### "Track unavailable"
- Some tracks restricted by region or label
- Try different track
- Check Spotify app can play the track

## Testing

### Manual Testing Checklist
- [ ] OAuth flow completes successfully
- [ ] Track search returns results
- [ ] DJ can select and play tracks
- [ ] All room members hear synchronized playback
- [ ] Pause/resume works for all members
- [ ] Drift stays <50ms after 5+ minutes
- [ ] Token refresh works automatically
- [ ] Disconnect/reconnect works

### Automated Tests
```bash
# Backend tests
npm test -- spotify

# E2E tests
npm run test:e2e -- spotify-integration
```

## Limitations

- Requires Spotify Premium (SDK limitation)
- Playback only works on physical devices (no simulators)
- Some tracks may be unavailable due to licensing
- Maximum 5 users per room for optimal sync

## Future Enhancements

- Queue system for track requests
- Playlist support
- Crossfade between tracks
- Audio effects/filters
- Integration with other music services
```

**Step 2: Create E2E tests**

Create `backend/test/spotify-integration.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Spotify Integration (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login to get auth token
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'spotify_test_user',
        password: 'password123',
        displayName: 'Spotify Test',
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username: 'spotify_test_user',
        password: 'password123',
      });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /spotify/authorize', () => {
    it('should return authorization URL', () => {
      return request(app.getHttpServer())
        .get('/spotify/authorize')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.url).toContain('https://accounts.spotify.com/authorize');
          expect(res.body.state).toBeDefined();
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/spotify/authorize')
        .expect(401);
    });
  });

  describe('GET /spotify/status', () => {
    it('should return authentication status', () => {
      return request(app.getHttpServer())
        .get('/spotify/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('authenticated');
          expect(typeof res.body.authenticated).toBe('boolean');
        });
    });
  });

  // Note: Search and track endpoints require valid Spotify token
  // These tests would need mock Spotify API or integration test environment
});
```

**Step 3: Update README**

Update `README.md`:
```markdown
## Phase 4: Music Integration ✅

GrooveBox now integrates with Spotify for real music playback!

### Features
- 🎵 Spotify Premium integration
- 🔍 Track search with album art
- 🎧 Synchronized playback across all devices
- ⏱️ <50ms sync accuracy
- 🔄 Automatic drift correction

### Setup
See [Spotify Integration Guide](./docs/spotify-integration.md) for setup instructions.

### Requirements
- Spotify Premium account
- Spotify app installed on device
- Internet connection
```

**Step 4: Run all tests**

```bash
# Backend unit tests
cd backend
npm test

# Backend E2E tests
npm run test:e2e

# Frontend (if configured)
cd mobile
npm test
```

**Step 5: Commit**

```bash
git add docs backend/test README.md
git commit -m "docs: add Spotify integration guide and tests"
```

---

## Final Verification

**Manual Testing Checklist:**

1. **Backend**
   - [ ] All 177+ unit tests pass
   - [ ] Spotify OAuth flow works
   - [ ] Track search returns results
   - [ ] Token refresh works automatically
   - [ ] WebSocket playback events broadcast correctly

2. **Frontend**
   - [ ] Spotify authentication completes
   - [ ] Deep linking works (callback redirect)
   - [ ] Track search UI displays results
   - [ ] Album art loads correctly
   - [ ] Track selection works

3. **Integration**
   - [ ] DJ can search and play tracks
   - [ ] All room members receive playback event
   - [ ] Synchronized playback starts on all devices
   - [ ] Drift stays <50ms after 5+ minutes
   - [ ] Pause/resume works for all members
   - [ ] Disconnect/reconnect preserves playback

4. **Error Handling**
   - [ ] Non-Premium accounts show helpful error
   - [ ] Unavailable tracks handled gracefully
   - [ ] Network errors don't crash app
   - [ ] Token expiration handled automatically

---

## Deployment Notes

**Environment Variables Required:**
```env
SPOTIFY_CLIENT_ID=<from Spotify Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Dashboard>
SPOTIFY_REDIRECT_URI=groovebox://spotify/callback
```

**Production Considerations:**
- Register production redirect URI in Spotify Dashboard
- Use HTTPS for backend in production
- Monitor Spotify API rate limits (180 requests per minute)
- Implement caching for frequently searched tracks
- Consider Spotify Web API pagination for large result sets

**Known Limitations:**
- Spotify SDK only works on physical devices
- Requires active internet connection
- Premium account required
- Regional track availability varies

---

## Success Criteria

✅ **Backend complete when:**
- OAuth flow functional
- Token management working
- Track search API returning results
- Playback integration with sync system

✅ **Frontend complete when:**
- Spotify SDK configured for iOS/Android
- Authentication flow working
- Track search UI functional
- Synchronized playback working

✅ **Phase 4 complete when:**
- Manual testing checklist 100% passed
- All automated tests passing
- Documentation complete
- Code committed and pushed

---

**Estimated Time:** 2-3 days with subagent-driven-development workflow

**Dependencies:** Phases 1-3 must be complete (sync system operational)
