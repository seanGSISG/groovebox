import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/entities/user.entity';
import { Repository } from 'typeorm';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Enable validation pipe like in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up users before each test
    await userRepository.query('DELETE FROM users WHERE username LIKE $1', ['testuser%']);
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser1',
          password: 'password123',
          displayName: 'Test User 1',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual({
            message: 'User registered successfully',
            username: 'testuser1',
          });
        });
    });

    it('should reject registration with duplicate username', async () => {
      // Register first user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser2',
          password: 'password123',
          displayName: 'Test User 2',
        })
        .expect(201);

      // Try to register again with same username
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser2',
          password: 'differentpassword',
          displayName: 'Different User',
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toBe('Username already exists');
        });
    });

    it('should reject registration with invalid username', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'ab', // too short
          password: 'password123',
          displayName: 'Test User',
        })
        .expect(400);
    });

    it('should reject registration with short password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser3',
          password: 'short', // less than 8 characters
          displayName: 'Test User',
        })
        .expect(400);
    });

    it('should reject registration with invalid username characters', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'test user!@#', // invalid characters
          password: 'password123',
          displayName: 'Test User',
        })
        .expect(400);
    });

    it('should reject registration with missing fields', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser4',
          // missing password and displayName
        })
        .expect(400);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Register a test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser_login',
          password: 'password123',
          displayName: 'Test Login User',
        });
    });

    it('should login successfully with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser_login',
          password: 'password123',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.accessToken).toBeTruthy();
          expect(res.body.user).toMatchObject({
            username: 'testuser_login',
            displayName: 'Test Login User',
          });
          expect(res.body.user).toHaveProperty('id');
        });
    });

    it('should reject login with invalid password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser_login',
          password: 'wrongpassword',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid credentials');
        });
    });

    it('should reject login with non-existent username', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid credentials');
        });
    });

    it('should reject login with missing fields', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser_login',
          // missing password
        })
        .expect(400);
    });
  });

  describe('/auth/profile (GET)', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login a test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser_profile',
          password: 'password123',
          displayName: 'Test Profile User',
        });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser_profile',
          password: 'password123',
        });

      accessToken = loginResponse.body.accessToken;
    });

    it('should get user profile with valid token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({
            username: 'testuser_profile',
            displayName: 'Test Profile User',
          });
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('createdAt');
          expect(res.body).toHaveProperty('lastSeen');
        });
    });

    it('should reject profile request without token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);
    });

    it('should reject profile request with invalid token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should reject profile request with malformed authorization header', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);
    });
  });

  describe('JWT token validation', () => {
    it('should generate valid JWT token that can be verified', async () => {
      // Register user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser_jwt',
          password: 'password123',
          displayName: 'Test JWT User',
        });

      // Login and get token
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'testuser_jwt',
          password: 'password123',
        });

      const { accessToken } = loginResponse.body;

      // Use token to access protected endpoint
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.username).toBe('testuser_jwt');
        });
    });
  });

  describe('Password hashing', () => {
    it('should not store plain text passwords', async () => {
      const password = 'testpassword123';

      // Register user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: 'testuser_hash',
          password: password,
          displayName: 'Test Hash User',
        });

      // Get user from database
      const user = await userRepository.findOne({
        where: { username: 'testuser_hash' },
      });

      expect(user).toBeTruthy();
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(password);
      expect(user.passwordHash.length).toBeGreaterThan(password.length);
    });
  });
});
