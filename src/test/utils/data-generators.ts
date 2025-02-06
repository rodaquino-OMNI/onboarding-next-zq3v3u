/**
 * @fileoverview Test data generation utilities for healthcare enrollment system
 * Implements HIPAA-compliant test data generation with multi-language support
 * @version 1.0.0
 */

import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';
import { 
  User, 
  UserRole, 
  Language, 
  Theme, 
  UserPreferences 
} from '../../web/src/app/core/interfaces/user.interface';
import { 
  Enrollment,
  EnrollmentStatus,
  EnrollmentMetadata,
  PersonalInfo,
  AddressInfo,
  ContactInfo,
  EnrollmentPreferences
} from '../../web/src/app/core/interfaces/enrollment.interface';
import { 
  Document,
  DocumentType,
  DocumentStatus,
  OcrResult 
} from '../../web/src/app/core/interfaces/document.interface';

// Constants for test data generation
const TEST_DATA_PREFIX = '[TEST]';
const DEFAULT_LANGUAGE = Language.English;
const DEFAULT_ROLE = UserRole.Individual;

/**
 * Generates HIPAA-compliant test user data
 * @param role Optional user role, defaults to Individual
 * @param language Optional language preference
 * @returns Generated User object with test data
 */
export function generateUser(role: UserRole = DEFAULT_ROLE, language: Language = DEFAULT_LANGUAGE): User {
  // Validate role
  if (!Object.values(UserRole).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  // Generate base user preferences
  const preferences: UserPreferences = {
    language,
    theme: Theme.Light,
    notifications: {
      email: true,
      sms: true,
      inApp: true
    },
    accessibility: {
      fontSize: 16,
      highContrast: false
    }
  };

  // Generate timestamps
  const now = new Date();
  const lastLogin = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago

  return {
    id: uuidv4(),
    name: `${TEST_DATA_PREFIX} ${faker.person.fullName()}`,
    email: `${TEST_DATA_PREFIX}.${faker.internet.email().toLowerCase()}`,
    role,
    preferences,
    emailVerifiedAt: lastLogin,
    mfaEnabled: role === UserRole.Admin,
    lastLoginAt: lastLogin,
    createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    updatedAt: now
  };
}

/**
 * Generates test enrollment data with healthcare metadata
 * @param status Optional enrollment status
 * @param user Optional associated user
 * @returns Generated Enrollment object
 */
export function generateEnrollment(
  status: EnrollmentStatus = EnrollmentStatus.DRAFT,
  user?: User
): Enrollment {
  // Validate status
  if (!Object.values(EnrollmentStatus).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const testUser = user || generateUser();
  const now = new Date();

  // Generate HIPAA-compliant personal information
  const personalInfo: PersonalInfo = {
    firstName: `${TEST_DATA_PREFIX} ${faker.person.firstName()}`,
    lastName: `${TEST_DATA_PREFIX} ${faker.person.lastName()}`,
    dateOfBirth: faker.date.past({ years: 50 }).toISOString().split('T')[0],
    gender: faker.helpers.arrayElement(['M', 'F', 'O']),
    ssn: `${TEST_DATA_PREFIX}-${faker.number.int({ min: 100000000, max: 999999999 })}`,
    maritalStatus: faker.helpers.arrayElement(['single', 'married', 'divorced', 'widowed']),
    nationality: faker.location.country(),
    preferredLanguage: testUser.preferences.language
  };

  // Generate address information
  const addressInfo: AddressInfo = {
    street: faker.location.street(),
    number: faker.number.int({ min: 1, max: 9999 }).toString(),
    complement: faker.location.secondaryAddress(),
    neighborhood: faker.location.county(),
    city: faker.location.city(),
    state: faker.location.state(),
    zipCode: faker.location.zipCode(),
    country: 'Brazil',
    residenceSince: faker.date.past({ years: 5 }).toISOString().split('T')[0]
  };

  // Generate contact information
  const contactInfo: ContactInfo = {
    email: testUser.email,
    emailVerified: true,
    phone: faker.phone.number('+55 ## #####-####'),
    phoneVerified: true,
    alternativePhone: faker.phone.number('+55 ## #####-####'),
    preferredContactMethod: 'email'
  };

  // Generate enrollment preferences
  const preferences: EnrollmentPreferences = {
    communicationLanguage: testUser.preferences.language,
    notificationPreferences: {
      email: true,
      sms: true,
      push: true
    },
    accessibilityRequirements: [],
    timeZone: 'America/Sao_Paulo'
  };

  // Calculate progress based on status
  const progressMap: Record<EnrollmentStatus, number> = {
    [EnrollmentStatus.DRAFT]: 10,
    [EnrollmentStatus.DOCUMENTS_PENDING]: 25,
    [EnrollmentStatus.DOCUMENTS_SUBMITTED]: 40,
    [EnrollmentStatus.HEALTH_DECLARATION_PENDING]: 55,
    [EnrollmentStatus.INTERVIEW_SCHEDULED]: 70,
    [EnrollmentStatus.INTERVIEW_COMPLETED]: 85,
    [EnrollmentStatus.COMPLETED]: 100,
    [EnrollmentStatus.CANCELLED]: 0
  };

  return {
    id: uuidv4(),
    user_id: testUser.id,
    status,
    metadata: {
      personal_info: personalInfo,
      address_info: addressInfo,
      contact_info: contactInfo,
      preferences
    },
    documents: [],
    healthRecords: [],
    interviews: [],
    progress: progressMap[status],
    completed_at: status === EnrollmentStatus.COMPLETED ? now.toISOString() : undefined,
    created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    updated_at: now.toISOString()
  };
}

/**
 * Generates test document data with simulated OCR results
 * @param enrollment Associated enrollment
 * @param type Document type
 * @returns Generated Document object
 */
export function generateDocument(enrollment: Enrollment, type: DocumentType): Document {
  // Validate document type
  if (!Object.values(DocumentType).includes(type)) {
    throw new Error(`Invalid document type: ${type}`);
  }

  const now = new Date();
  const documentId = uuidv4();

  // Generate simulated OCR data based on document type
  const ocrData: OcrResult = {
    confidence: faker.number.int({ min: 85, max: 99 }),
    extractedText: `${TEST_DATA_PREFIX} Sample extracted text for ${type}`,
    fields: {
      documentNumber: `${TEST_DATA_PREFIX}-${faker.number.int({ min: 10000, max: 99999 })}`,
      issueDate: faker.date.past({ years: 5 }).toISOString(),
      expiryDate: faker.date.future({ years: 5 }).toISOString()
    },
    validationErrors: [],
    sensitiveDataFound: true,
    processingMetadata: {
      processingTime: faker.number.int({ min: 1000, max: 5000 }),
      processingServer: `test-ocr-${faker.number.int({ min: 1, max: 10 })}`
    }
  };

  return {
    id: documentId,
    enrollmentId: enrollment.id,
    type,
    storagePath: `test-documents/${enrollment.id}/${type.toLowerCase()}/${documentId}.pdf`,
    encryptionKey: uuidv4(),
    ocrData,
    status: DocumentStatus.VERIFIED,
    processedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
    verifiedBy: enrollment.user_id,
    verifiedAt: now,
    retentionPeriod: 365, // 1 year retention
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
    updatedAt: now
  };
}