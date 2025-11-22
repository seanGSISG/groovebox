import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { RegisterDto, LoginDto } from './dto';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const registerDto: RegisterDto = {
        username: 'testuser',
        password: 'password123',
        displayName: 'Test User',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hashed',
      });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
      });

      const result = await service.register(registerDto);

      expect(result).toEqual({
        message: 'User registered successfully',
        username: 'testuser',
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { username: 'testuser' } });
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if username already exists', async () => {
      const registerDto: RegisterDto = {
        username: 'existinguser',
        password: 'password123',
        displayName: 'Existing User',
      };

      mockUserRepository.findOne.mockResolvedValue({
        id: '1',
        username: 'existinguser',
      });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should hash password', async () => {
      const registerDto: RegisterDto = {
        username: 'testuser',
        password: 'password123',
        displayName: 'Test User',
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      let capturedPasswordHash: string | undefined;
      mockUserRepository.create.mockImplementation((user) => {
        capturedPasswordHash = user.passwordHash;
        return {
          id: '1',
          username: 'testuser',
          displayName: 'Test User',
          passwordHash: user.passwordHash,
        };
      });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        username: 'testuser',
      });

      await service.register(registerDto);

      expect(capturedPasswordHash).toBeDefined();
      expect(capturedPasswordHash).not.toBe('password123');
      // Verify it's a bcrypt hash (starts with $2b$ or $2a$)
      expect(capturedPasswordHash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe('login', () => {
    it('should successfully login and return access token', async () => {
      const loginDto: LoginDto = {
        username: 'testuser',
        password: 'password123',
      };

      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: hashedPassword,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: 'jwt-token',
        user: {
          id: '1',
          username: 'testuser',
          displayName: 'Test User',
        },
      });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: '1',
        username: 'testuser',
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const loginDto: LoginDto = {
        username: 'nonexistent',
        password: 'password123',
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const loginDto: LoginDto = {
        username: 'testuser',
        password: 'wrongpassword',
      };

      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: '1',
        username: 'testuser',
        passwordHash: hashedPassword,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user has no password (guest)', async () => {
      const loginDto: LoginDto = {
        username: 'guestuser',
        password: 'password123',
      };

      const mockUser = {
        id: '1',
        username: 'guestuser',
        passwordHash: null,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('should return user if found', async () => {
      const mockUser = {
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser('1');

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('should return null if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await service.validateUser('999');

      expect(result).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        lastSeen: new Date('2024-01-02'),
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getProfile('1');

      expect(result).toEqual({
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        lastSeen: new Date('2024-01-02'),
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfile('999')).rejects.toThrow(UnauthorizedException);
    });
  });
});
