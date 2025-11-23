import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { YouTubeService } from './youtube.service';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('YouTubeService', () => {
  let service: YouTubeService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockApiKey = 'test-api-key';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouTubeService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'YOUTUBE_API_KEY') return mockApiKey;
              return null;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<YouTubeService>(YouTubeService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractVideoId', () => {
    it('should extract video ID from standard youtube.com/watch URL', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from standard youtube.com/watch URL with additional params', () => {
      const url =
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be short URL', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be short URL with timestamp', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ?t=42';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from youtu.be URL with path segments', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ/share';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from embed URL', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from mobile youtube URL', () => {
      const url = 'https://m.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(service.extractVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('should return null for invalid YouTube URL', () => {
      const url = 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw';
      expect(service.extractVideoId(url)).toBeNull();
    });

    it('should return null for non-YouTube URL', () => {
      const url = 'https://www.example.com/watch?v=dQw4w9WgXcQ';
      expect(service.extractVideoId(url)).toBeNull();
    });

    it('should return null for malformed URL', () => {
      const url = 'not-a-valid-url';
      expect(service.extractVideoId(url)).toBeNull();
    });

    it('should return null for empty video ID', () => {
      const url = 'https://www.youtube.com/watch?v=';
      expect(service.extractVideoId(url)).toBeNull();
    });
  });

  describe('parseDuration', () => {
    it('should parse duration with hours, minutes, and seconds', () => {
      expect(service.parseDuration('PT1H30M45S')).toBe(5445); // 3600 + 1800 + 45
    });

    it('should parse duration with minutes and seconds', () => {
      expect(service.parseDuration('PT4M33S')).toBe(273); // 240 + 33
    });

    it('should parse duration with only minutes', () => {
      expect(service.parseDuration('PT3M')).toBe(180);
    });

    it('should parse duration with only seconds', () => {
      expect(service.parseDuration('PT45S')).toBe(45);
    });

    it('should parse duration with only hours', () => {
      expect(service.parseDuration('PT2H')).toBe(7200);
    });

    it('should parse duration with hours and minutes', () => {
      expect(service.parseDuration('PT1H15M')).toBe(4500); // 3600 + 900
    });

    it('should parse duration with hours and seconds', () => {
      expect(service.parseDuration('PT1H30S')).toBe(3630); // 3600 + 30
    });

    it('should return 0 for invalid duration format', () => {
      expect(service.parseDuration('invalid')).toBe(0);
    });

    it('should return 0 for empty duration', () => {
      expect(service.parseDuration('PT')).toBe(0);
    });
  });

  describe('getVideoDetails', () => {
    const mockVideoId = 'dQw4w9WgXcQ';
    const mockYouTubeResponse = {
      data: {
        items: [
          {
            id: mockVideoId,
            snippet: {
              title: 'Never Gonna Give You Up',
              channelTitle: 'Rick Astley',
              thumbnails: {
                default: {
                  url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
                  width: 120,
                  height: 90,
                },
                medium: {
                  url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
                  width: 320,
                  height: 180,
                },
                high: {
                  url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
                  width: 480,
                  height: 360,
                },
              },
            },
            contentDetails: {
              duration: 'PT3M33S',
            },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    } as AxiosResponse;

    it('should fetch and return video details', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockYouTubeResponse));

      const result = await service.getVideoDetails(mockVideoId);

      expect(result).toEqual({
        videoId: mockVideoId,
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnails: {
          default: {
            url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
            width: 120,
            height: 90,
          },
          medium: {
            url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            width: 320,
            height: 180,
          },
          high: {
            url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            width: 480,
            height: 360,
          },
        },
        duration: 'PT3M33S',
        durationSeconds: 213,
      });

      expect(httpService.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'snippet,contentDetails',
            id: mockVideoId,
            key: mockApiKey,
          },
          timeout: 10000,
        },
      );
    });

    it('should throw BadRequestException if video not found', async () => {
      const emptyResponse = {
        ...mockYouTubeResponse,
        data: { items: [] },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(emptyResponse));

      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        `Video not found or not available: ${mockVideoId}`,
      );
    });

    it('should throw BadRequestException if API key not configured', async () => {
      // Create a new service instance without API key
      const moduleWithoutKey = await Test.createTestingModule({
        providers: [
          YouTubeService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => null),
            },
          },
          {
            provide: HttpService,
            useValue: {
              get: jest.fn(),
            },
          },
        ],
      }).compile();

      const serviceWithoutKey =
        moduleWithoutKey.get<YouTubeService>(YouTubeService);

      await expect(
        serviceWithoutKey.getVideoDetails(mockVideoId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        serviceWithoutKey.getVideoDetails(mockVideoId),
      ).rejects.toThrow('YouTube API key not configured on server');
    });

    it('should throw BadRequestException on 403 API error', async () => {
      const error = {
        response: {
          status: 403,
          data: { error: 'Forbidden' },
        },
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => error));

      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        'YouTube API quota exceeded or invalid API key',
      );
    });

    it('should throw BadRequestException on 404 API error', async () => {
      const error = {
        response: {
          status: 404,
          data: { error: 'Not Found' },
        },
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => error));

      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        `Video not found: ${mockVideoId}`,
      );
    });

    it('should throw BadRequestException on generic API error', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: 'Internal Server Error' },
        },
        message: 'Request failed',
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => error));

      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getVideoDetails(mockVideoId)).rejects.toThrow(
        'Failed to fetch video details from YouTube',
      );
    });
  });

  describe('validateUrl', () => {
    const mockVideoId = 'dQw4w9WgXcQ';
    const validUrl = `https://www.youtube.com/watch?v=${mockVideoId}`;

    const mockYouTubeResponse = {
      data: {
        items: [
          {
            id: mockVideoId,
            snippet: {
              title: 'Test Video',
              channelTitle: 'Test Channel',
              thumbnails: {
                default: { url: 'test.jpg', width: 120, height: 90 },
                medium: { url: 'test.jpg', width: 320, height: 180 },
                high: { url: 'test.jpg', width: 480, height: 360 },
              },
            },
            contentDetails: {
              duration: 'PT3M33S',
            },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    } as AxiosResponse;

    it('should validate and return video ID for valid URL', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockYouTubeResponse));

      const result = await service.validateUrl(validUrl);

      expect(result).toBe(mockVideoId);
    });

    it('should throw BadRequestException for invalid URL', async () => {
      const invalidUrl = 'https://www.example.com/not-youtube';

      await expect(service.validateUrl(invalidUrl)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validateUrl(invalidUrl)).rejects.toThrow(
        'Invalid YouTube URL',
      );
    });

    it('should throw BadRequestException if video does not exist', async () => {
      const emptyResponse = {
        ...mockYouTubeResponse,
        data: { items: [] },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(emptyResponse));

      await expect(service.validateUrl(validUrl)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate youtu.be URLs', async () => {
      const shortUrl = `https://youtu.be/${mockVideoId}`;
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockYouTubeResponse));

      const result = await service.validateUrl(shortUrl);

      expect(result).toBe(mockVideoId);
    });

    it('should validate embed URLs', async () => {
      const embedUrl = `https://www.youtube.com/embed/${mockVideoId}`;
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockYouTubeResponse));

      const result = await service.validateUrl(embedUrl);

      expect(result).toBe(mockVideoId);
    });
  });
});
