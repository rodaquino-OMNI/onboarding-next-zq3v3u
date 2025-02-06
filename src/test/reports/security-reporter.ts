import fs from 'fs'; // @types/node ^16.0.0
import xml2js from 'xml2js'; // xml2js ^0.5.0
import handlebars from 'handlebars'; // handlebars ^4.7.0
import winston from 'winston'; // winston ^3.8.0
import { owaspConfig } from '../security/owasp-dependency-check.json';
import { zapApiConfig } from '../security/zap-api-scan.conf';
import { zapBaselineConfig } from '../security/zap-baseline.conf';

/**
 * Interface for security scan report configuration
 */
interface ReportConfig {
  outputDir: string;
  reportName: string;
  thresholds: {
    high: number;
    medium: number;
    low: number;
  };
  complianceRules: {
    hipaa: boolean;
    gdpr: boolean;
    lgpd: boolean;
  };
}

/**
 * Interface for OWASP dependency check report
 */
interface OwaspReport {
  dependencies: Array<{
    fileName: string;
    vulnerabilities: Array<{
      name: string;
      severity: string;
      cvssScore: number;
      description: string;
      recommendation: string;
    }>;
  }>;
  metrics: {
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

/**
 * Interface for ZAP security scan report
 */
interface ZapReport {
  alerts: Array<{
    name: string;
    risk: string;
    confidence: string;
    description: string;
    solution: string;
    references: string[];
    instances: Array<{
      uri: string;
      method: string;
      evidence: string;
    }>;
  }>;
  metrics: {
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

/**
 * Enhanced security reporter with healthcare compliance validation
 */
export class SecurityReporter {
  private readonly outputDir: string;
  private readonly config: ReportConfig;
  private readonly template: handlebars.TemplateDelegate;
  private readonly auditLogger: winston.Logger;
  private readonly healthcareValidator: ComplianceValidator;

  constructor(config: ReportConfig, healthcareRules: any) {
    this.config = config;
    this.outputDir = config.outputDir;
    this.healthcareValidator = new ComplianceValidator(healthcareRules);

    // Initialize audit logger
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: `${this.outputDir}/security-audit.log`,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      ]
    });

    // Load report template
    const templatePath = `${__dirname}/templates/security-report.hbs`;
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    this.template = handlebars.compile(templateContent);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Parse OWASP Dependency Check report with healthcare compliance validation
   */
  private async parseOwaspReport(reportPath: string, config: any): Promise<OwaspReport> {
    try {
      const xmlContent = fs.readFileSync(reportPath, 'utf8');
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlContent);

      const report: OwaspReport = {
        dependencies: [],
        metrics: { high: 0, medium: 0, low: 0, total: 0 }
      };

      // Process dependencies and vulnerabilities
      for (const dependency of result.analysis.dependencies.dependency) {
        const vulns = dependency.vulnerabilities?.vulnerability || [];
        const vulnerabilities = vulns.map(vuln => ({
          name: vuln.name,
          severity: vuln.severity,
          cvssScore: parseFloat(vuln.cvssScore),
          description: vuln.description,
          recommendation: vuln.recommendation
        }));

        report.dependencies.push({
          fileName: dependency.fileName,
          vulnerabilities
        });

        // Update metrics
        vulnerabilities.forEach(v => {
          report.metrics.total++;
          if (v.cvssScore >= 7.0) report.metrics.high++;
          else if (v.cvssScore >= 4.0) report.metrics.medium++;
          else report.metrics.low++;
        });
      }

      this.auditLogger.info('OWASP report parsed successfully', {
        reportPath,
        metrics: report.metrics
      });

      return report;
    } catch (error) {
      this.auditLogger.error('Failed to parse OWASP report', {
        reportPath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Parse ZAP security scan report with healthcare validation
   */
  private async parseZapReport(reportPath: string, scanType: string, config: any): Promise<ZapReport> {
    try {
      const jsonContent = fs.readFileSync(reportPath, 'utf8');
      const zapResult = JSON.parse(jsonContent);

      const report: ZapReport = {
        alerts: [],
        metrics: { high: 0, medium: 0, low: 0, total: 0 }
      };

      // Process alerts with healthcare context
      for (const alert of zapResult.site[0].alerts) {
        const healthcareImpact = this.healthcareValidator.validateAlert(alert);
        
        report.alerts.push({
          name: alert.name,
          risk: alert.riskdesc,
          confidence: alert.confidence,
          description: alert.desc,
          solution: alert.solution,
          references: alert.reference.split('\n'),
          instances: alert.instances.map(instance => ({
            uri: instance.uri,
            method: instance.method,
            evidence: instance.evidence
          }))
        });

        // Update metrics
        report.metrics.total++;
        switch (alert.riskcode) {
          case 3: report.metrics.high++; break;
          case 2: report.metrics.medium++; break;
          case 1: report.metrics.low++; break;
        }
      }

      this.auditLogger.info('ZAP report parsed successfully', {
        reportPath,
        scanType,
        metrics: report.metrics
      });

      return report;
    } catch (error) {
      this.auditLogger.error('Failed to parse ZAP report', {
        reportPath,
        scanType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive security report with compliance validation
   */
  public async generateReports(): Promise<void> {
    try {
      // Parse individual reports
      const owaspReport = await this.parseOwaspReport(
        `${this.outputDir}/dependency-check-report.xml`,
        owaspConfig
      );

      const zapApiReport = await this.parseZapReport(
        `${this.outputDir}/zap-api-scan.json`,
        'api',
        zapApiConfig
      );

      const zapBaselineReport = await this.parseZapReport(
        `${this.outputDir}/zap-baseline.json`,
        'baseline',
        zapBaselineConfig
      );

      // Validate healthcare compliance
      const complianceResults = this.healthcareValidator.validateCompliance({
        owaspReport,
        zapApiReport,
        zapBaselineReport
      });

      // Generate aggregate metrics
      const aggregateMetrics = {
        high: owaspReport.metrics.high + zapApiReport.metrics.high + zapBaselineReport.metrics.high,
        medium: owaspReport.metrics.medium + zapApiReport.metrics.medium + zapBaselineReport.metrics.medium,
        low: owaspReport.metrics.low + zapApiReport.metrics.low + zapBaselineReport.metrics.low,
        total: owaspReport.metrics.total + zapApiReport.metrics.total + zapBaselineReport.metrics.total
      };

      // Check against thresholds
      const thresholdResults = this.checkSecurityThresholds(aggregateMetrics);

      // Generate report content
      const reportContent = this.template({
        timestamp: new Date().toISOString(),
        metrics: aggregateMetrics,
        thresholds: thresholdResults,
        compliance: complianceResults,
        dependencies: owaspReport.dependencies,
        apiSecurity: zapApiReport.alerts,
        baselineSecurity: zapBaselineReport.alerts
      });

      // Write reports
      const reportPath = `${this.outputDir}/${this.config.reportName}`;
      fs.writeFileSync(`${reportPath}.html`, reportContent);
      fs.writeFileSync(`${reportPath}.json`, JSON.stringify({
        metrics: aggregateMetrics,
        thresholds: thresholdResults,
        compliance: complianceResults
      }, null, 2));

      this.auditLogger.info('Security reports generated successfully', {
        metrics: aggregateMetrics,
        compliance: complianceResults.status
      });

    } catch (error) {
      this.auditLogger.error('Failed to generate security reports', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate security findings against thresholds
   */
  private checkSecurityThresholds(metrics: any): any {
    const results = {
      passed: true,
      details: {}
    };

    // Check high severity findings
    if (metrics.high > this.config.thresholds.high) {
      results.passed = false;
      results.details.high = {
        status: 'failed',
        message: `High severity findings (${metrics.high}) exceed threshold (${this.config.thresholds.high})`
      };
    }

    // Check medium severity findings
    if (metrics.medium > this.config.thresholds.medium) {
      results.passed = false;
      results.details.medium = {
        status: 'failed',
        message: `Medium severity findings (${metrics.medium}) exceed threshold (${this.config.thresholds.medium})`
      };
    }

    this.auditLogger.info('Security thresholds checked', {
      metrics,
      thresholds: this.config.thresholds,
      passed: results.passed
    });

    return results;
  }
}