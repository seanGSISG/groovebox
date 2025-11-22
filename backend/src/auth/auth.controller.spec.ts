import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    getProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto: RegisterDto = {
        username: 'testuser',
        password: 'password123',
        displayName: 'Test User',
      };

      const expectedResult = {
        message: 'User registered successfully',
        username: 'testuser',
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expectedResult);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('should login user and return access token', async () => {
      const loginDto: LoginDto = {
        username: 'testuser',
        password: 'password123',
      };

      const expectedResult = {
        accessToken: 'jwt-token',
        user: {
          id: '1',
          username: 'testuser',
          displayName: 'Test User',
        },
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResult);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockRequest = {
        user: {
          id: '1',
          username: 'testuser',
          displayName: 'Test User',
        },
      };

      const expectedResult = {
        id: '1',
        username: 'testuser',
        displayName: 'Test User',
        createdAt: new Date('2024-01-01'),
        lastSeen: new Date('2024-01-02'),
      };

      mockAuthService.getProfile.mockResolvedValue(expectedResult);

      const result = await controller.getProfile(mockRequest);

      expect(result).toEqual(expectedResult);
      expect(authService.getProfile).toHaveBeenCalledWith('1');
    });
  });
});
