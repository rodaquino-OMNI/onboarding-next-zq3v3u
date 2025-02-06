import { AxeResults, Result, NodeResult } from 'axe-core';
import { promises as fs } from 'fs-extra';
import * as Handlebars from 'handlebars';
import { axeConfiguration } from '../accessibility/axe-config.json';

// Version comments for external dependencies
// axe-core: ^4.7.0 - Core accessibility testing engine
// fs-extra: ^11.0.0 - Enhanced file system operations
// handlebars: ^4.7.0 - Template rendering engine

interface ReportOptions {
  language: string;
  outputFormat: 'html' | 'pdf' | 'both';
  includeHealthcareMetrics: boolean;
  complianceLevel: 'A' | 'AA' | 'AAA';
}

interface FormattedViolation {
  id: string;
  impact: string;
  description: string;
  nodes: FormattedNode[];
  wcagCriteria: string[];
  healthcareImpact?: string;
  remediation: string;
  medicalContext?: string;
}

interface FormattedNode {
  html: string;
  target: string[];
  failureSummary: string;
  medicalTerms?: string[];
  criticalHealth?: boolean;
}

interface ReportSummary {
  totalTests: number;
  violations: number;
  passes: number;
  incomplete: number;
  wcagCompliance: number;
  healthcareCompliance: number;
  criticalViolations: number;
  medicalTermViolations: number;
}

export class AccessibilityReporter {
  private readonly REPORT_TEMPLATE_PATH = './templates/accessibility-report.hbs';
  private readonly HEALTHCARE_TEMPLATE_PATH = './templates/healthcare-report.hbs';
  private readonly OUTPUT_DIR = './reports/accessibility';
  private readonly SUPPORTED_LANGUAGES = ['en', 'pt-BR'];

  constructor() {
    this.initializeTemplates();
  }

  private async initializeTemplates(): Promise<void> {
    // Register custom Handlebars helpers for healthcare-specific formatting
    Handlebars.registerHelper('formatHealthcareImpact', (impact: string) => {
      return impact === 'critical' ? 'Immediate Action Required' : 'Review Required';
    });

    Handlebars.registerHelper('localizeHealthcareTerm', (term: string, language: string) => {
      const translations = axeConfiguration.locale.medicalTerms[language];
      return translations[term] || term;
    });
  }

  public async generateAccessibilityReport(
    testResults: AxeResults,
    options: ReportOptions
  ): Promise<string> {
    try {
      // Validate language support
      if (!this.SUPPORTED_LANGUAGES.includes(options.language)) {
        throw new Error(`Unsupported language: ${options.language}`);
      }

      // Process violations and generate formatted report data
      const formattedViolations = testResults.violations.map(violation => 
        this.formatViolation(violation, options.language));

      // Generate summary statistics
      const summary = this.generateSummaryStats(testResults);

      // Prepare report context
      const reportContext = {
        timestamp: new Date().toISOString(),
        branding: axeConfiguration.branding,
        summary,
        violations: formattedViolations,
        healthcareMetrics: options.includeHealthcareMetrics ? 
          this.generateHealthcareMetrics(testResults) : null,
        language: options.language
      };

      // Generate and export report
      const reportPath = await this.exportReportLocalized(
        options.language,
        reportContext,
        options.outputFormat
      );

      return reportPath;
    } catch (error) {
      throw new Error(`Failed to generate accessibility report: ${error.message}`);
    }
  }

  private formatViolation(violation: Result, language: string): FormattedViolation {
    const healthcareRules = axeConfiguration.runOptions.healthcareValidation;
    
    return {
      id: violation.id,
      impact: violation.impact,
      description: this.getLocalizedDescription(violation.description, language),
      nodes: violation.nodes.map(node => this.formatNode(node, language)),
      wcagCriteria: this.mapToWCAGCriteria(violation),
      healthcareImpact: this.determineHealthcareImpact(violation, healthcareRules),
      remediation: this.generateRemediation(violation, language),
      medicalContext: this.extractMedicalContext(violation, language)
    };
  }

  private formatNode(node: NodeResult, language: string): FormattedNode {
    return {
      html: node.html,
      target: node.target,
      failureSummary: this.getLocalizedFailureSummary(node.failureSummary, language),
      medicalTerms: this.extractMedicalTerms(node, language),
      criticalHealth: this.isCriticalHealthData(node)
    };
  }

  private generateSummaryStats(testResults: AxeResults): ReportSummary {
    const totalTests = testResults.passes.length + 
      testResults.violations.length + 
      testResults.incomplete.length;

    const healthcareViolations = testResults.violations.filter(
      v => this.isHealthcareRelatedViolation(v)
    );

    return {
      totalTests,
      violations: testResults.violations.length,
      passes: testResults.passes.length,
      incomplete: testResults.incomplete.length,
      wcagCompliance: (testResults.passes.length / totalTests) * 100,
      healthcareCompliance: this.calculateHealthcareCompliance(testResults),
      criticalViolations: healthcareViolations.filter(v => v.impact === 'critical').length,
      medicalTermViolations: this.countMedicalTermViolations(testResults)
    };
  }

  private async exportReportLocalized(
    language: string,
    reportData: any,
    outputFormat: ReportOptions['outputFormat']
  ): Promise<string> {
    const templatePath = reportData.healthcareMetrics ? 
      this.HEALTHCARE_TEMPLATE_PATH : 
      this.REPORT_TEMPLATE_PATH;

    const template = await fs.readFile(templatePath, 'utf-8');
    const compiledTemplate = Handlebars.compile(template);
    const reportContent = compiledTemplate(reportData);

    // Ensure output directory exists
    await fs.ensureDir(this.OUTPUT_DIR);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `accessibility-report-${language}-${timestamp}`;

    if (outputFormat === 'html' || outputFormat === 'both') {
      const htmlPath = `${this.OUTPUT_DIR}/${baseFilename}.html`;
      await fs.writeFile(htmlPath, reportContent);
    }

    if (outputFormat === 'pdf' || outputFormat === 'both') {
      // PDF generation logic would go here
      const pdfPath = `${this.OUTPUT_DIR}/${baseFilename}.pdf`;
      await this.generatePDFReport(reportContent, pdfPath);
    }

    return this.OUTPUT_DIR;
  }

  private generateHealthcareMetrics(testResults: AxeResults): any {
    return {
      criticalDataProtection: this.analyzeCriticalDataProtection(testResults),
      medicalTerminologyAccuracy: this.analyzeMedicalTerminology(testResults),
      healthcareNavigation: this.analyzeHealthcareNavigation(testResults),
      complianceStatus: {
        hipaa: this.checkHIPAACompliance(testResults),
        lgpd: this.checkLGPDCompliance(testResults)
      }
    };
  }

  private isHealthcareRelatedViolation(violation: Result): boolean {
    const healthcareSelectors = axeConfiguration.runOptions.healthcareValidation.criticalDataSelectors;
    return violation.nodes.some(node => 
      healthcareSelectors.some(selector => 
        node.target.some(target => target.includes(selector))
      )
    );
  }

  private calculateHealthcareCompliance(testResults: AxeResults): number {
    const healthcareRules = Object.keys(axeConfiguration.rules)
      .filter(rule => rule.includes('health') || rule.includes('medical'));
    
    const healthcareTests = testResults.passes.concat(testResults.violations)
      .filter(result => healthcareRules.includes(result.id));

    const passedTests = healthcareTests.filter(test => 
      testResults.passes.some(pass => pass.id === test.id));

    return (passedTests.length / healthcareTests.length) * 100;
  }

  private async generatePDFReport(htmlContent: string, outputPath: string): Promise<void> {
    // PDF generation implementation would go here
    // This would typically use a library like puppeteer to convert HTML to PDF
    throw new Error('PDF generation not implemented');
  }
}