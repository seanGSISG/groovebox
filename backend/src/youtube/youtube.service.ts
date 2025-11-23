import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { YouTubeVideoDetailsDto } from './dto/youtube-video.dto';

interface CacheEntry {
  data: YouTubeVideoDetailsDto;
  timestamp: number;
}

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private readonly apiKey: string | undefined;
  private readonly youtubeApiUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTTL = 60 * 60 * 1000; // 1 hour in milliseconds
  private readonly requestTimeout = 10000; // 10 seconds

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
    if (!this.apiKey) {
      this.logger.warn(
        'YOUTUBE_API_KEY not configured. YouTube features will not work.',
      );
    }
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheTTL;
  }

  /**
   * Get cached video details if available and valid
   */
  private getCachedVideoDetails(
    videoId: string,
  ): YouTubeVideoDetailsDto | null {
    const cached = this.cache.get(videoId);
    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }
    // Remove expired cache entry
    if (cached) {
      this.cache.delete(videoId);
    }
    return null;
  }

  /**
   * Cache video details
   */
  private setCachedVideoDetails(
    videoId: string,
    data: YouTubeVideoDetailsDto,
  ): void {
    this.cache.set(videoId, { data, timestamp: Date.now() });
  }

  /**
   * Validate video ID format
   * YouTube video IDs are 11 characters long and contain alphanumeric characters, hyphens, and underscores
   */
  private isValidVideoIdFormat(videoId: string): boolean {
    const videoIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    return videoIdRegex.test(videoId);
  }

  /**
   * Extract video ID from various YouTube URL formats
   * Supports:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://www.youtube.com/embed/VIDEO_ID
   */
  extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // youtu.be format
      if (urlObj.hostname === 'youtu.be') {
        const videoId = urlObj.pathname.slice(1).split('/')[0];
        return videoId && this.isValidVideoIdFormat(videoId) ? videoId : null;
      }

      // youtube.com formats
      if (
        urlObj.hostname === 'www.youtube.com' ||
        urlObj.hostname === 'youtube.com' ||
        urlObj.hostname === 'm.youtube.com'
      ) {
        // watch?v=VIDEO_ID format
        if (urlObj.pathname === '/watch') {
          const videoId = urlObj.searchParams.get('v');
          return videoId && this.isValidVideoIdFormat(videoId) ? videoId : null;
        }

        // embed/VIDEO_ID format
        if (urlObj.pathname.startsWith('/embed/')) {
          const videoId = urlObj.pathname.split('/')[2];
          return videoId && this.isValidVideoIdFormat(videoId) ? videoId : null;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Error parsing URL: ${url}`, error);
      return null;
    }
  }

  /**
   * Parse ISO 8601 duration format to seconds
   * Examples:
   * - PT4M33S = 273 seconds
   * - PT1H30M45S = 5445 seconds
   * - PT3M = 180 seconds
   */
  parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    if (!match) {
      this.logger.error(`Invalid duration format: ${duration}`);
      return 0;
    }

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Fetch video details from YouTube Data API v3
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetailsDto> {
    if (!this.apiKey) {
      throw new BadRequestException(
        'YouTube API key not configured on server',
      );
    }

    // Check cache first
    const cached = this.getCachedVideoDetails(videoId);
    if (cached) {
      this.logger.debug(`Cache hit for video: ${videoId}`);
      return cached;
    }

    try {
      const url = `${this.youtubeApiUrl}/videos`;
      const params = {
        part: 'snippet,contentDetails',
        id: videoId,
        key: this.apiKey,
      };

      const response = await firstValueFrom(
        this.httpService.get(url, { params, timeout: this.requestTimeout }),
      );

      if (!response.data.items || response.data.items.length === 0) {
        throw new BadRequestException(
          `Video not found or not available: ${videoId}`,
        );
      }

      const video = response.data.items[0];

      // Defensive checks for nested properties
      if (!video.snippet) {
        throw new BadRequestException(
          `Invalid video data: missing snippet for ${videoId}`,
        );
      }

      if (!video.contentDetails) {
        throw new BadRequestException(
          `Invalid video data: missing contentDetails for ${videoId}`,
        );
      }

      const snippet = video.snippet;
      const contentDetails = video.contentDetails;

      // Validate required fields
      if (!snippet.title || !snippet.channelTitle) {
        throw new BadRequestException(
          `Invalid video data: missing required fields for ${videoId}`,
        );
      }

      if (!snippet.thumbnails) {
        throw new BadRequestException(
          `Invalid video data: missing thumbnails for ${videoId}`,
        );
      }

      if (!contentDetails.duration) {
        throw new BadRequestException(
          `Invalid video data: missing duration for ${videoId}`,
        );
      }

      const durationSeconds = this.parseDuration(contentDetails.duration);

      const videoDetails: YouTubeVideoDetailsDto = {
        videoId,
        title: snippet.title,
        channelTitle: snippet.channelTitle,
        thumbnails: {
          default: snippet.thumbnails.default,
          medium: snippet.thumbnails.medium,
          high: snippet.thumbnails.high,
        },
        duration: contentDetails.duration,
        durationSeconds,
      };

      // Cache the result
      this.setCachedVideoDetails(videoId, videoDetails);

      return videoDetails;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Error fetching video details for ${videoId}:`,
        error.message,
      );

      // Specific network error handling
      if (error.code === 'ECONNREFUSED') {
        throw new BadRequestException(
          'Unable to connect to YouTube API. Please try again later.',
        );
      }

      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        throw new BadRequestException(
          'Request to YouTube API timed out. Please try again.',
        );
      }

      if (error.response?.status === 429) {
        throw new BadRequestException(
          'YouTube API rate limit exceeded. Please try again later.',
        );
      }

      if (error.response?.status === 403) {
        throw new BadRequestException(
          'YouTube API quota exceeded or invalid API key',
        );
      }

      if (error.response?.status === 404) {
        throw new BadRequestException(`Video not found: ${videoId}`);
      }

      throw new BadRequestException(
        'Failed to fetch video details from YouTube',
      );
    }
  }

  /**
   * Validate YouTube URL and return video ID
   * Throws BadRequestException if URL is invalid or video doesn't exist
   */
  async validateUrl(url: string): Promise<string> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      throw new BadRequestException(
        'Invalid YouTube URL. Please provide a valid YouTube video URL.',
      );
    }

    // Verify the video exists by fetching its details
    await this.getVideoDetails(videoId);

    return videoId;
  }
}
