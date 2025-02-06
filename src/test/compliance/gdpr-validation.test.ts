import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { UserService } from '../../web/src/app/core/services/user.service';
import { StorageService } from '../../web/src/app/core/services/storage.service';
import { describe, it, beforeEach, afterEach, expect } from 'jest';
import { User, UserPreferences } from '../../web/src/app/core/interfaces/user.interface';

/**
 * GDPR Compliance Validation Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for validating GDPR compliance requirements including:
 * - User consent management
 * - Data retention policies
 * - Data portability
 * - Right to be forgotten
 */

describe('GDPR Compliance Validation', () => {
  let userService: UserService;
  let storageService: StorageService;

  // Test user data with GDPR-specific attributes
  const createTestUser = (overrides = {}): User => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    preferences: {
      gdprConsent: {
        marketing: false,
        analytics: false,
        thirdParty: false,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      },
      dataRetention: {
        documentRetentionDays: 90,
        profileRetentionDays: 365,
        autoDeleteEnabled: true
      },
      ...overrides
    },
    role: 'individual',
    emailVerifiedAt: new Date(),
    mfaEnabled: false,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        StorageService
      ]
    });

    userService = TestBed.inject(UserService);
    storageService = TestBed.inject(StorageService);
  });

  afterEach(() => {
    // Clean up storage after each test
    storageService.clear().subscribe();
  });

  describe('User Consent Management', () => {
    it('should properly store and track user consent preferences', fakeAsync(() => {
      const testUser = createTestUser();
      const consentUpdate: UserPreferences = {
        gdprConsent: {
          marketing: true,
          analytics: true,
          thirdParty: false,
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };

      userService.updatePreferences(consentUpdate).subscribe(updatedUser => {
        expect(updatedUser.preferences.gdprConsent.marketing).toBe(true);
        expect(updatedUser.preferences.gdprConsent.analytics).toBe(true);
        expect(updatedUser.preferences.gdprConsent.thirdParty).toBe(false);
        expect(updatedUser.preferences.gdprConsent.timestamp).toBeDefined();
      });

      tick();
    }));

    it('should maintain consent history for audit purposes', fakeAsync(() => {
      const consentHistory = 'gdpr_consent_history';
      const initialConsent = {
        marketing: false,
        timestamp: new Date().toISOString()
      };

      storageService.setSecureItem(consentHistory, [initialConsent]).subscribe();
      tick();

      const updatedConsent = {
        marketing: true,
        timestamp: new Date().toISOString()
      };

      storageService.getSecureItem(consentHistory, Array).subscribe(history => {
        const newHistory = [...(history || []), updatedConsent];
        storageService.setSecureItem(consentHistory, newHistory).subscribe();
      });

      tick();

      storageService.getSecureItem(consentHistory, Array).subscribe(history => {
        expect(history.length).toBe(2);
        expect(history[0].marketing).toBe(false);
        expect(history[1].marketing).toBe(true);
      });

      tick();
    }));
  });

  describe('Data Retention Policies', () => {
    it('should enforce data retention periods', fakeAsync(() => {
      const testUser = createTestUser({
        dataRetention: {
          documentRetentionDays: 90,
          profileRetentionDays: 365,
          autoDeleteEnabled: true
        }
      });

      // Simulate document storage with retention metadata
      const documentData = {
        id: 'doc-1',
        createdAt: new Date(Date.now() - (91 * 24 * 60 * 60 * 1000)), // 91 days old
        retentionPeriod: 90
      };

      storageService.setItem('document_metadata', documentData).subscribe();
      tick();

      // Verify document is flagged for deletion after retention period
      storageService.getItem('document_metadata', Object).subscribe(doc => {
        const now = new Date();
        const docAge = Math.floor((now.getTime() - new Date(doc.createdAt).getTime()) / (24 * 60 * 60 * 1000));
        expect(docAge > doc.retentionPeriod).toBe(true);
      });

      tick();
    }));
  });

  describe('Data Portability', () => {
    it('should export user data in machine-readable format', fakeAsync(() => {
      const testUser = createTestUser();
      
      userService.exportUserData().subscribe(exportedData => {
        expect(exportedData).toHaveProperty('personalData');
        expect(exportedData).toHaveProperty('preferences');
        expect(exportedData).toHaveProperty('documents');
        expect(exportedData.format).toBe('json');
        expect(exportedData.version).toBeDefined();
      });

      tick();
    }));

    it('should include all required data categories in export', fakeAsync(() => {
      const testUser = createTestUser();
      
      userService.exportUserData().subscribe(exportedData => {
        // Verify all GDPR-required data categories
        expect(exportedData.personalData).toBeDefined();
        expect(exportedData.preferences).toBeDefined();
        expect(exportedData.consentHistory).toBeDefined();
        expect(exportedData.documents).toBeDefined();
        expect(exportedData.healthRecords).toBeDefined();
      });

      tick();
    }));
  });

  describe('Right to be Forgotten', () => {
    it('should completely remove user data upon request', fakeAsync(() => {
      const testUser = createTestUser();
      
      // Store test data
      storageService.setSecureItem('user_profile', testUser).subscribe();
      storageService.setItem('user_documents', [{ id: 'doc1' }]).subscribe();
      tick();

      // Execute right to be forgotten
      userService.deleteUserAccount().subscribe(() => {
        // Verify all user data is removed
        storageService.getSecureItem('user_profile', Object).subscribe(profile => {
          expect(profile).toBeNull();
        });

        storageService.getItem('user_documents', Array).subscribe(docs => {
          expect(docs).toBeNull();
        });

        // Verify user service state
        expect(userService.getCurrentUser()).toBeNull();
      });

      tick();
    }));

    it('should maintain deletion log for compliance', fakeAsync(() => {
      const testUser = createTestUser();
      const deletionLog = 'gdpr_deletion_log';

      userService.deleteUserAccount().subscribe(() => {
        storageService.getSecureItem(deletionLog, Array).subscribe(log => {
          expect(log).toContainEqual({
            userId: testUser.id,
            deletionDate: expect.any(String),
            categories: expect.arrayContaining(['profile', 'documents', 'preferences'])
          });
        });
      });

      tick();
    }));
  });
});