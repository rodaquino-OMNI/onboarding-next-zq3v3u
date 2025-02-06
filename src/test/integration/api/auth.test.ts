/**
 * @fileoverview Integration tests for authentication endpoints
 * Implements comprehensive testing of auth flows with HIPAA compliance
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'jest';
import { setupTestEnvironment, createAuthenticatedClient } from '../../utils/test-helpers';
import APIClient from '../../utils/api-client';
import { generateUser } from '../../utils/data-generators';
import { User, UserRole, Language } from '../../../web/src/app/core/interfaces/user.interface';

describe('Authentication API Integration Tests', () => {
  let apiClient: APIClient;
  let testEnv: any;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    apiClient = testEnv.apiClient;
  });

  describe('User Registration', () => {
    it('should successfully register a new individual user', async () => {
      const testUser = generateUser(UserRole.Individual, Language.English);
      
      const response = await apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'Test123!@#',
        password_confirmation: 'Test123!@#',
        role: UserRole.Individual,
        language: Language.English,
        preferences: testUser.preferences
      });

      expect(response.status).toBe(201);
      expect(response.data).toMatchObject({
        user: {
          email: testUser.email,
          role: UserRole.Individual,
          preferences: expect.objectContaining({
            language: Language.English
          })
        },
        token: expect.any(String)
      });
      expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('should enforce password complexity requirements', async () => {
      const testUser = generateUser(UserRole.Individual);
      
      await expect(apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'weak',
        password_confirmation: 'weak',
        role: UserRole.Individual
      })).rejects.toMatchObject({
        code: '422',
        message: expect.stringContaining('password')
      });
    });

    it('should prevent duplicate email registration', async () => {
      const testUser = generateUser(UserRole.Individual);
      
      // First registration
      await apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'Test123!@#',
        password_confirmation: 'Test123!@#',
        role: UserRole.Individual
      });

      // Attempt duplicate registration
      await expect(apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'Test123!@#',
        password_confirmation: 'Test123!@#',
        role: UserRole.Individual
      })).rejects.toMatchObject({
        code: '422',
        message: expect.stringContaining('email already exists')
      });
    });

    it('should support multi-language registration', async () => {
      const testUser = generateUser(UserRole.Individual, Language.Portuguese);
      
      const response = await apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'Test123!@#',
        password_confirmation: 'Test123!@#',
        role: UserRole.Individual,
        language: Language.Portuguese,
        preferences: testUser.preferences
      });

      expect(response.data.user.preferences.language).toBe(Language.Portuguese);
    });
  });

  describe('User Login', () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = generateUser(UserRole.Individual);
      
      // Register user for login tests
      await apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'Test123!@#',
        password_confirmation: 'Test123!@#',
        role: UserRole.Individual
      });
    });

    it('should successfully authenticate valid credentials', async () => {
      const response = await apiClient.axiosInstance.post('/auth/login', {
        email: testUser.email,
        password: 'Test123!@#'
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        token: expect.any(String),
        user: expect.objectContaining({
          email: testUser.email,
          role: UserRole.Individual
        })
      });
    });

    it('should enforce account lockout after failed attempts', async () => {
      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await expect(apiClient.axiosInstance.post('/auth/login', {
          email: testUser.email,
          password: 'WrongPassword123!'
        })).rejects.toMatchObject({
          code: '401'
        });
      }

      // Verify account lockout
      await expect(apiClient.axiosInstance.post('/auth/login', {
        email: testUser.email,
        password: 'Test123!@#'
      })).rejects.toMatchObject({
        code: '423',
        message: expect.stringContaining('account has been locked')
      });
    });

    it('should validate MFA token for admin users', async () => {
      const adminUser = generateUser(UserRole.Admin);
      
      // Register admin user
      await apiClient.axiosInstance.post('/auth/register', {
        name: adminUser.name,
        email: adminUser.email,
        password: 'Admin123!@#',
        password_confirmation: 'Admin123!@#',
        role: UserRole.Admin
      });

      // Attempt login without MFA
      await expect(apiClient.axiosInstance.post('/auth/login', {
        email: adminUser.email,
        password: 'Admin123!@#'
      })).rejects.toMatchObject({
        code: '403',
        message: expect.stringContaining('MFA required')
      });
    });
  });

  describe('Token Management', () => {
    let authToken: string;

    beforeEach(async () => {
      const testUser = generateUser(UserRole.Individual);
      
      // Register and login user
      await apiClient.axiosInstance.post('/auth/register', {
        name: testUser.name,
        email: testUser.email,
        password: 'Test123!@#',
        password_confirmation: 'Test123!@#',
        role: UserRole.Individual
      });

      const loginResponse = await apiClient.axiosInstance.post('/auth/login', {
        email: testUser.email,
        password: 'Test123!@#'
      });

      authToken = loginResponse.data.token;
      apiClient.setAuthToken(authToken);
    });

    it('should successfully refresh valid tokens', async () => {
      const response = await apiClient.axiosInstance.post('/auth/refresh');

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        token: expect.any(String)
      });
      expect(response.data.token).not.toBe(authToken);
    });

    it('should revoke tokens on logout', async () => {
      // Logout
      await apiClient.axiosInstance.post('/auth/logout');

      // Attempt to use revoked token
      await expect(apiClient.axiosInstance.get('/user/profile')).rejects.toMatchObject({
        code: '401',
        message: expect.stringContaining('token')
      });
    });
  });

  describe('Role-Based Access Control', () => {
    it('should enforce role-specific permissions', async () => {
      // Create users with different roles
      const roles = [UserRole.Individual, UserRole.Broker, UserRole.Interviewer, UserRole.Admin];
      
      for (const role of roles) {
        const user = generateUser(role);
        const { data: { token } } = await apiClient.axiosInstance.post('/auth/register', {
          name: user.name,
          email: user.email,
          password: 'Test123!@#',
          password_confirmation: 'Test123!@#',
          role
        });

        apiClient.setAuthToken(token);

        // Test role-specific endpoints
        switch (role) {
          case UserRole.Individual:
            await expect(apiClient.axiosInstance.get('/enrollments')).resolves.toBeTruthy();
            await expect(apiClient.axiosInstance.get('/admin/users')).rejects.toMatchObject({
              code: '403'
            });
            break;

          case UserRole.Admin:
            await expect(apiClient.axiosInstance.get('/admin/users')).resolves.toBeTruthy();
            await expect(apiClient.axiosInstance.get('/admin/system/logs')).resolves.toBeTruthy();
            break;
        }
      }
    });
  });

  describe('Security Controls', () => {
    it('should enforce rate limiting', async () => {
      const requests = Array(100).fill(null).map(() => 
        apiClient.axiosInstance.post('/auth/login', {
          email: 'test@example.com',
          password: 'Test123!@#'
        })
      );

      await expect(Promise.all(requests)).rejects.toMatchObject({
        code: '429',
        message: expect.stringContaining('Too Many Requests')
      });
    });

    it('should log security events', async () => {
      const testUser = generateUser(UserRole.Individual);
      
      // Trigger security event
      await expect(apiClient.axiosInstance.post('/auth/login', {
        email: testUser.email,
        password: 'WrongPassword123!'
      })).rejects.toMatchObject({
        code: '401'
      });

      // Verify audit log entry (requires admin access)
      const adminUser = generateUser(UserRole.Admin);
      const { data: { token } } = await apiClient.axiosInstance.post('/auth/register', {
        name: adminUser.name,
        email: adminUser.email,
        password: 'Admin123!@#',
        password_confirmation: 'Admin123!@#',
        role: UserRole.Admin
      });

      apiClient.setAuthToken(token);

      const logsResponse = await apiClient.axiosInstance.get('/admin/security/logs');
      expect(logsResponse.data.logs).toContainEqual(
        expect.objectContaining({
          event: 'failed_login_attempt',
          email: testUser.email
        })
      );
    });
  });
});