/**
 * @fileoverview Custom Jest reporter for healthcare enrollment testing with compliance tracking
 * Implements detailed test reporting with healthcare-specific metrics and multi-language support
 * @version 1.0.0
 */

import { Reporter } from '@jest/reporters'; // ^29.0.0
import chalk from 'chalk'; // ^4.1.2
import i18next from 'i18next'; // ^21.8.0
import { setupTestEnvironment, ComplianceConfig } from '../utils/test-helpers';
import path from 'path';
import fs from 'fs';

// Global configuration constants
const COVERAGE_THRESHOLD = 80;
const REPORT_OUTPUT_DIR = './reports/jest';
const COMPLIANCE_CATEGORIES = ['HIPAA', 'GDPR', 'LGPD'];
const SECURITY_TEST_PATTERNS = [/auth/, /security/, /encryption/];

/**
 * Test result with compliance categorization
 */
interface ComplianceTestResult {
  testFilePath: string;
  testResults: Array<{
    title: string;
    status: 'passed' | 'failed';
    duration: number;
    complianceCategory?: string;
  }>;
  numPassingTests: number;
  numFailingTests: number;
  coverage?: any;
}

/**
 * Enhanced Jest reporter for healthcare enrollment testing
 */
export class CustomJestReporter implements Reporter {
  private reportTitle: string;
  private testResults: ComplianceTestResult[];
  private coverageResults: any;
  private complianceResults: Map<string, {
    total: number;
    passed: number;
    failed: number;
  }>;
  private securityResults: {
    total: number;
    passed: number;
    failed: number;
  };
  private i18nInstance: typeof i18next;

  constructor(globalConfig: any, options: any = {}) {
    this.reportTitle = 'AUSTA Integration Platform Test Report';
    this.testResults = [];
    this.coverageResults = {};
    this.complianceResults = new Map();
    this.securityResults = {
      total: 0,
      passed: 0,
      failed: 0
    };

    // Initialize compliance categories
    COMPLIANCE_CATEGORIES.forEach(category => {
      this.complianceResults.set(category, {
        total: 0,
        passed: 0,
        failed: 0
      });
    });

    // Initialize i18n
    this.setupI18n();
  }

  /**
   * Initializes internationalization support
   */
  private async setupI18n(): Promise<void> {
    this.i18nInstance = i18next.createInstance();
    await this.i18nInstance.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: {
          translation: {
            reportTitle: 'Healthcare Enrollment Test Report',
            compliance: 'Compliance Results',
            security: 'Security Test Results',
            coverage: 'Code Coverage',
            passed: 'Passed',
            failed: 'Failed',
            total: 'Total'
          }
        },
        'pt-BR': {
          translation: {
            reportTitle: 'Relatório de Testes de Inscrição em Saúde',
            compliance: 'Resultados de Conformidade',
            security: 'Resultados de Testes de Segurança',
            coverage: 'Cobertura de Código',
            passed: 'Aprovados',
            failed: 'Falhos',
            total: 'Total'
          }
        }
      }
    });
  }

  /**
   * Handles test suite start
   */
  onRunStart(): void {
    console.log(chalk.blue('\n🏥 Starting AUSTA Integration Platform Tests\n'));
    
    // Ensure report directory exists
    if (!fs.existsSync(REPORT_OUTPUT_DIR)) {
      fs.mkdirSync(REPORT_OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Processes individual test results with compliance categorization
   */
  onTestResult(test: any, testResult: any): void {
    const complianceResult: ComplianceTestResult = {
      testFilePath: testResult.testFilePath,
      testResults: [],
      numPassingTests: testResult.numPassingTests,
      numFailingTests: testResult.numFailingTests
    };

    // Process each test case
    testResult.testResults.forEach((result: any) => {
      // Determine compliance category
      const complianceCategory = this.determineComplianceCategory(result.title);
      
      // Track compliance results
      if (complianceCategory) {
        const stats = this.complianceResults.get(complianceCategory)!;
        stats.total++;
        if (result.status === 'passed') {
          stats.passed++;
        } else {
          stats.failed++;
        }
      }

      // Track security tests
      if (this.isSecurityTest(result.title)) {
        this.securityResults.total++;
        if (result.status === 'passed') {
          this.securityResults.passed++;
        } else {
          this.securityResults.failed++;
        }
      }

      complianceResult.testResults.push({
        title: result.title,
        status: result.status === 'passed' ? 'passed' : 'failed',
        duration: result.duration,
        complianceCategory
      });
    });

    this.testResults.push(complianceResult);
  }

  /**
   * Generates final test report with compliance metrics
   */
  async onRunComplete(contexts: Set<any>, results: any): Promise<void> {
    // Process coverage data if available
    if (results.coverageMap) {
      this.coverageResults = results.coverageMap.getCoverageSummary();
    }

    // Generate reports
    await this.generateHTMLReport();
    await this.generateJSONReport();
    
    // Print summary
    this.printSummary();

    // Validate coverage threshold
    this.validateCoverageThreshold();
  }

  /**
   * Determines compliance category based on test title
   */
  private determineComplianceCategory(testTitle: string): string | undefined {
    for (const category of COMPLIANCE_CATEGORIES) {
      if (testTitle.includes(category)) {
        return category;
      }
    }
    return undefined;
  }

  /**
   * Checks if test is security-related
   */
  private isSecurityTest(testTitle: string): boolean {
    return SECURITY_TEST_PATTERNS.some(pattern => pattern.test(testTitle));
  }

  /**
   * Generates detailed HTML test report
   */
  private async generateHTMLReport(): Promise<void> {
    const reportPath = path.join(REPORT_OUTPUT_DIR, 'report.html');
    const template = this.generateHTMLTemplate();
    
    fs.writeFileSync(reportPath, template);
  }

  /**
   * Generates JSON format test report
   */
  private async generateJSONReport(): Promise<void> {
    const reportPath = path.join(REPORT_OUTPUT_DIR, 'report.json');
    const report = {
      summary: {
        total: this.testResults.reduce((sum, result) => sum + result.testResults.length, 0),
        passed: this.testResults.reduce((sum, result) => sum + result.numPassingTests, 0),
        failed: this.testResults.reduce((sum, result) => sum + result.numFailingTests, 0)
      },
      compliance: Object.fromEntries(this.complianceResults),
      security: this.securityResults,
      coverage: this.coverageResults,
      results: this.testResults
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  /**
   * Generates HTML report template
   */
  private generateHTMLTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${this.i18nInstance.t('reportTitle')}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .summary { margin-bottom: 20px; }
            .compliance { margin-bottom: 20px; }
            .security { margin-bottom: 20px; }
            .coverage { margin-bottom: 20px; }
            .passed { color: green; }
            .failed { color: red; }
          </style>
        </head>
        <body>
          <h1>${this.i18nInstance.t('reportTitle')}</h1>
          ${this.generateHTMLSections()}
        </body>
      </html>
    `;
  }

  /**
   * Generates HTML report sections
   */
  private generateHTMLSections(): string {
    return `
      <div class="summary">
        <h2>${this.i18nInstance.t('total')}</h2>
        ${this.generateSummaryHTML()}
      </div>
      <div class="compliance">
        <h2>${this.i18nInstance.t('compliance')}</h2>
        ${this.generateComplianceHTML()}
      </div>
      <div class="security">
        <h2>${this.i18nInstance.t('security')}</h2>
        ${this.generateSecurityHTML()}
      </div>
      <div class="coverage">
        <h2>${this.i18nInstance.t('coverage')}</h2>
        ${this.generateCoverageHTML()}
      </div>
    `;
  }

  /**
   * Validates coverage against threshold
   */
  private validateCoverageThreshold(): void {
    if (this.coverageResults.pct < COVERAGE_THRESHOLD) {
      console.error(chalk.red(
        `\n❌ Coverage ${this.coverageResults.pct}% below threshold ${COVERAGE_THRESHOLD}%\n`
      ));
      process.exit(1);
    }
  }

  /**
   * Prints test execution summary
   */
  private printSummary(): void {
    console.log(chalk.blue('\n=== Test Execution Summary ===\n'));
    
    // Print compliance results
    COMPLIANCE_CATEGORIES.forEach(category => {
      const stats = this.complianceResults.get(category)!;
      console.log(chalk.cyan(`\n${category} Compliance:`));
      console.log(`Total: ${stats.total}`);
      console.log(chalk.green(`Passed: ${stats.passed}`));
      console.log(chalk.red(`Failed: ${stats.failed}`));
    });

    // Print security results
    console.log(chalk.cyan('\nSecurity Tests:'));
    console.log(`Total: ${this.securityResults.total}`);
    console.log(chalk.green(`Passed: ${this.securityResults.passed}`));
    console.log(chalk.red(`Failed: ${this.securityResults.failed}`));

    // Print coverage
    if (this.coverageResults.pct) {
      console.log(chalk.cyan('\nCode Coverage:'));
      console.log(`${this.coverageResults.pct}%`);
    }
  }
}