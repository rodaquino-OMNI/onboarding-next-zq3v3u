/**
 * @fileoverview Mock FHIR API implementation for testing EMR integration
 * Implements FHIR 4.0.1 compliant responses with HIPAA validation
 * @version 1.0.0
 */

import { mockApiResponse } from '../utils/test-helpers';
import jest from 'jest';

// FHIR API version and supported resource types
const FHIR_VERSION = '4.0.1';
const MOCK_RESOURCE_TYPES = [
  'Patient',
  'Observation',
  'Condition',
  'AllergyIntolerance',
  'MedicationStatement',
  'Procedure',
  'Immunization',
  'CarePlan',
  'DiagnosticReport'
] as const;

// HIPAA-compliant data masking patterns
const PHI_MASKING_PATTERNS = {
  ssn: /\d{3}-\d{2}-\d{4}/,
  mrn: /MRN-\d{6}/,
  phone: /\+?1?\d{10}/,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
};

/**
 * Creates a FHIR 4.0.1 compliant mock resource response
 * @param resourceType FHIR resource type
 * @param data Resource data
 * @param options Response configuration options
 * @returns FHIR formatted response object
 */
export function createMockFHIRResponse(
  resourceType: typeof MOCK_RESOURCE_TYPES[number],
  data: Record<string, any>,
  options: {
    includeMeta?: boolean;
    maskPHI?: boolean;
    addExtensions?: boolean;
  } = {}
): Record<string, any> {
  // Validate resource type
  if (!MOCK_RESOURCE_TYPES.includes(resourceType)) {
    throw new Error(`Invalid FHIR resource type: ${resourceType}`);
  }

  // Apply PHI masking if enabled
  const maskedData = options.maskPHI ? maskPHIData(data) : data;

  // Construct FHIR response
  const response = {
    resourceType,
    id: `test-${Date.now()}`,
    meta: options.includeMeta ? {
      versionId: '1',
      lastUpdated: new Date().toISOString(),
      profile: [`http://hl7.org/fhir/StructureDefinition/${resourceType}`]
    } : undefined,
    ...maskedData
  };

  // Add FHIR extensions if requested
  if (options.addExtensions) {
    response.extension = [{
      url: 'http://example.com/fhir/StructureDefinition/test-extension',
      valueString: 'Test Extension Value'
    }];
  }

  return response;
}

/**
 * Validates FHIR resources against version 4.0.1 schemas
 * @param resource FHIR resource to validate
 * @param validationOptions Validation configuration
 * @returns Validation result with compliance status
 */
export function mockFHIRValidation(
  resource: Record<string, any>,
  validationOptions: {
    checkHIPAA?: boolean;
    validateProfile?: boolean;
  } = {}
): { 
  valid: boolean;
  errors: string[];
  hipaaCompliant?: boolean;
} {
  const errors: string[] = [];

  // Basic FHIR validation
  if (!resource.resourceType || !MOCK_RESOURCE_TYPES.includes(resource.resourceType)) {
    errors.push('Invalid or missing resourceType');
  }

  // Required fields validation
  if (!resource.id) {
    errors.push('Missing resource id');
  }

  // HIPAA compliance check
  let hipaaCompliant = true;
  if (validationOptions.checkHIPAA) {
    hipaaCompliant = checkHIPAACompliance(resource);
  }

  return {
    valid: errors.length === 0,
    errors,
    hipaaCompliant: validationOptions.checkHIPAA ? hipaaCompliant : undefined
  };
}

/**
 * Enhanced mock service for FHIR API testing
 * Implements FHIR 4.0.1 compliance with HIPAA validation
 */
export class MockFHIRService {
  private baseUrl: string;
  private mockResponses: Map<string, Record<string, any>>;
  private errorSimulation: {
    enabled: boolean;
    probability: number;
    errorTypes: string[];
  };

  /**
   * Initialize mock FHIR service
   * @param baseUrl Base URL for mock service
   * @param config Service configuration
   */
  constructor(
    baseUrl: string = 'http://test.fhir.server/api/fhir/r4',
    config: {
      simulateErrors?: boolean;
      errorProbability?: number;
    } = {}
  ) {
    this.baseUrl = baseUrl;
    this.mockResponses = new Map();
    this.errorSimulation = {
      enabled: config.simulateErrors || false,
      probability: config.errorProbability || 0.1,
      errorTypes: ['timeout', 'validation', 'notFound', 'server']
    };
  }

  /**
   * Mock GET request for FHIR resources
   * @param resourceType FHIR resource type
   * @param parameters Query parameters
   * @param options Request options
   * @returns Promise resolving to FHIR response
   */
  async mockGetResource(
    resourceType: typeof MOCK_RESOURCE_TYPES[number],
    parameters: Record<string, string> = {},
    options: {
      includeMeta?: boolean;
      maskPHI?: boolean;
    } = {}
  ): Promise<Record<string, any>> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    // Error simulation
    if (this.shouldSimulateError()) {
      throw this.generateMockError();
    }

    // Check for custom mock response
    const customResponse = this.mockResponses.get(resourceType);
    if (customResponse) {
      return createMockFHIRResponse(resourceType, customResponse, options);
    }

    // Generate default mock response
    return createMockFHIRResponse(resourceType, this.generateDefaultData(resourceType), options);
  }

  /**
   * Mock POST request for FHIR resources
   * @param resourceType FHIR resource type
   * @param data Resource data
   * @param options Request options
   * @returns Promise resolving to creation response
   */
  async mockPostResource(
    resourceType: typeof MOCK_RESOURCE_TYPES[number],
    data: Record<string, any>,
    options: {
      validate?: boolean;
      checkHIPAA?: boolean;
    } = {}
  ): Promise<Record<string, any>> {
    // Validate request if enabled
    if (options.validate) {
      const validation = mockFHIRValidation(data, {
        checkHIPAA: options.checkHIPAA
      });
      
      if (!validation.valid) {
        throw new Error(`Invalid FHIR resource: ${validation.errors.join(', ')}`);
      }
    }

    // Create response with proper metadata
    const response = createMockFHIRResponse(resourceType, data, {
      includeMeta: true,
      maskPHI: true
    });

    return {
      ...response,
      meta: {
        ...response.meta,
        created: new Date().toISOString()
      }
    };
  }

  /**
   * Configure custom mock responses
   * @param resourceType FHIR resource type
   * @param response Custom response data
   * @param options Configuration options
   */
  setMockResponse(
    resourceType: typeof MOCK_RESOURCE_TYPES[number],
    response: Record<string, any>,
    options: {
      validate?: boolean;
    } = {}
  ): void {
    if (options.validate) {
      const validation = mockFHIRValidation(response);
      if (!validation.valid) {
        throw new Error(`Invalid mock response: ${validation.errors.join(', ')}`);
      }
    }
    this.mockResponses.set(resourceType, response);
  }

  /**
   * Reset mock service state
   */
  resetMocks(): void {
    this.mockResponses.clear();
  }

  /**
   * Generate default mock data for resource type
   * @param resourceType FHIR resource type
   * @returns Default mock data
   */
  private generateDefaultData(resourceType: string): Record<string, any> {
    const defaultData: Record<string, Record<string, any>> = {
      Patient: {
        name: [{ given: ['Test'], family: 'Patient' }],
        birthDate: '1970-01-01',
        gender: 'unknown'
      },
      Observation: {
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '12345-6',
            display: 'Test Observation'
          }]
        }
      }
      // Add other resource types as needed
    };

    return defaultData[resourceType] || {};
  }

  /**
   * Check if error should be simulated
   * @returns Boolean indicating if error should be simulated
   */
  private shouldSimulateError(): boolean {
    return this.errorSimulation.enabled && 
           Math.random() < this.errorSimulation.probability;
  }

  /**
   * Generate mock error response
   * @returns Simulated error
   */
  private generateMockError(): Error {
    const errorType = this.errorSimulation.errorTypes[
      Math.floor(Math.random() * this.errorSimulation.errorTypes.length)
    ];

    switch (errorType) {
      case 'timeout':
        return new Error('Request timeout');
      case 'validation':
        return new Error('Invalid resource format');
      case 'notFound':
        return new Error('Resource not found');
      default:
        return new Error('Internal server error');
    }
  }
}

/**
 * Mask PHI data in FHIR resources
 * @param data Resource data to mask
 * @returns Masked data
 */
function maskPHIData(data: Record<string, any>): Record<string, any> {
  const masked = { ...data };

  Object.entries(PHI_MASKING_PATTERNS).forEach(([field, pattern]) => {
    const stringData = JSON.stringify(masked);
    const matches = stringData.match(pattern);
    
    if (matches) {
      matches.forEach(match => {
        const maskedValue = match.replace(/[a-zA-Z0-9]/g, 'X');
        const maskedData = stringData.replace(match, maskedValue);
        Object.assign(masked, JSON.parse(maskedData));
      });
    }
  });

  return masked;
}

/**
 * Check HIPAA compliance of FHIR resource
 * @param resource FHIR resource to check
 * @returns Boolean indicating HIPAA compliance
 */
function checkHIPAACompliance(resource: Record<string, any>): boolean {
  // Check for required security extensions
  const hasSecurityExtension = resource.meta?.security?.some((s: any) => 
    s.system === 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality'
  );

  // Verify no unmasked PHI
  const stringData = JSON.stringify(resource);
  const hasUnmaskedPHI = Object.values(PHI_MASKING_PATTERNS).some(pattern => 
    pattern.test(stringData)
  );

  return hasSecurityExtension && !hasUnmaskedPHI;
}