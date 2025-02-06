import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { Chart } from 'chart.js';
import { THRESHOLDS } from '../k6/config.json';

// Package versions in comments as required:
// @types/node: ^16.18.0
// handlebars: ^4.7.7
// chart.js: ^3.9.1

const REPORT_DIR = process.env.K6_REPORT_DIR || './reports/k6';
const TEMPLATE_DIR = './templates/k6';

interface ReportOptions {
  templatePath?: string;
  outputDir?: string;
  cleanup?: boolean;
  retentionDays?: number;
}

interface MetricData {
  values: number[];
  timestamps: number[];
  tags: Record<string, string>[];
}

interface ThresholdResult {
  passed: boolean;
  threshold: string;
  value: number;
  breachCount?: number;
}

interface AnalysisResult {
  score: number;
  recommendations: string[];
  thresholdResults: Record<string, ThresholdResult>;
  trends: Record<string, number[]>;
}

export class K6Reporter {
  private templatePath: string;
  private outputDir: string;
  private options: ReportOptions;

  constructor(options: ReportOptions = {}) {
    this.templatePath = options.templatePath || path.join(TEMPLATE_DIR, 'report.hbs');
    this.outputDir = options.outputDir || REPORT_DIR;
    this.options = {
      cleanup: options.cleanup || false,
      retentionDays: options.retentionDays || 30,
      ...options
    };

    this.initializeHandlebars();
  }

  private initializeHandlebars(): void {
    handlebars.registerHelper('formatNumber', (value: number) => {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2
      }).format(value);
    });

    handlebars.registerHelper('formatDate', (timestamp: number) => {
      return new Date(timestamp).toISOString();
    });

    handlebars.registerHelper('thresholdStatus', (passed: boolean) => {
      return passed ? 'success' : 'failure';
    });
  }

  private async generateMetricsCharts(metrics: Record<string, MetricData>): Promise<Record<string, any>> {
    const charts: Record<string, any> = {};

    // Response Time Distribution Chart
    charts.responseTime = {
      type: 'line',
      data: {
        labels: metrics.http_req_duration.timestamps.map(t => new Date(t).toISOString()),
        datasets: [{
          label: 'Response Time (ms)',
          data: metrics.http_req_duration.values,
          borderColor: '#2196F3',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Response Time (ms)'
            }
          }
        }
      }
    };

    // Error Rate Chart
    charts.errorRate = {
      type: 'line',
      data: {
        labels: metrics.http_req_failed.timestamps.map(t => new Date(t).toISOString()),
        datasets: [{
          label: 'Error Rate (%)',
          data: metrics.http_req_failed.values.map(v => v * 100),
          borderColor: '#FF4081',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Error Rate (%)'
            }
          }
        }
      }
    };

    return charts;
  }

  private analyzeThresholds(results: Record<string, MetricData>): AnalysisResult {
    const analysis: AnalysisResult = {
      score: 100,
      recommendations: [],
      thresholdResults: {},
      trends: {}
    };

    // Analyze HTTP Request Duration
    const p95Duration = this.calculatePercentile(results.http_req_duration.values, 95);
    const p99Duration = this.calculatePercentile(results.http_req_duration.values, 99);

    analysis.thresholdResults.http_req_duration = {
      passed: p95Duration < 200 && p99Duration < 500,
      threshold: 'p(95)<200, p(99)<500',
      value: p95Duration
    };

    if (p95Duration >= 200) {
      analysis.score -= 20;
      analysis.recommendations.push(
        'Response times exceed target threshold. Consider optimizing database queries and implementing caching.'
      );
    }

    // Analyze Error Rate
    const errorRate = this.calculateMean(results.http_req_failed.values);
    analysis.thresholdResults.http_req_failed = {
      passed: errorRate < 0.01,
      threshold: 'rate<0.01',
      value: errorRate
    };

    if (errorRate >= 0.01) {
      analysis.score -= 30;
      analysis.recommendations.push(
        'Error rate exceeds acceptable threshold. Investigate error patterns and implement circuit breakers.'
      );
    }

    // Calculate Performance Trends
    analysis.trends = {
      responseTime: this.calculateTrend(results.http_req_duration.values),
      errorRate: this.calculateTrend(results.http_req_failed.values)
    };

    return analysis;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private calculateTrend(values: number[]): number[] {
    const windowSize = Math.min(10, Math.floor(values.length / 3));
    const trends: number[] = [];

    for (let i = windowSize; i < values.length; i++) {
      const windowMean = this.calculateMean(values.slice(i - windowSize, i));
      trends.push(windowMean);
    }

    return trends;
  }

  public async generateReport(results: Record<string, MetricData>): Promise<void> {
    try {
      // Generate performance charts
      const charts = await this.generateMetricsCharts(results);

      // Analyze results against thresholds
      const analysis = this.analyzeThresholds(results);

      // Prepare report data
      const reportData = {
        timestamp: new Date().toISOString(),
        charts,
        analysis,
        metrics: results,
        summary: {
          duration: results.http_req_duration.values.length,
          errors: results.http_req_failed.values.filter(v => v > 0).length,
          p95ResponseTime: this.calculatePercentile(results.http_req_duration.values, 95),
          errorRate: this.calculateMean(results.http_req_failed.values) * 100
        }
      };

      // Generate HTML report
      await this.saveReport(reportData);

    } catch (error) {
      console.error('Error generating k6 report:', error);
      throw error;
    }
  }

  private async saveReport(data: any): Promise<void> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const htmlPath = path.join(this.outputDir, `report-${timestamp}.html`);
    const jsonPath = path.join(this.outputDir, `report-${timestamp}.json`);

    // Read and compile template
    const template = handlebars.compile(
      fs.readFileSync(this.templatePath, 'utf-8')
    );

    // Generate and save HTML report
    const html = template(data);
    fs.writeFileSync(htmlPath, html);

    // Save JSON data
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    // Update report index
    this.updateReportIndex(htmlPath);

    // Cleanup old reports if enabled
    if (this.options.cleanup) {
      this.cleanupOldReports();
    }
  }

  private updateReportIndex(latestReport: string): void {
    const indexPath = path.join(this.outputDir, 'index.html');
    const reports = fs.readdirSync(this.outputDir)
      .filter(file => file.endsWith('.html') && file !== 'index.html')
      .map(file => ({
        name: file,
        path: file,
        date: fs.statSync(path.join(this.outputDir, file)).mtime
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const indexTemplate = handlebars.compile(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>K6 Performance Test Reports</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 2rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 0.5rem; border: 1px solid #ddd; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>K6 Performance Test Reports</h1>
          <table>
            <tr>
              <th>Date</th>
              <th>Report</th>
            </tr>
            {{#each reports}}
            <tr>
              <td>{{formatDate date}}</td>
              <td><a href="{{path}}">{{name}}</a></td>
            </tr>
            {{/each}}
          </table>
        </body>
      </html>
    `);

    fs.writeFileSync(indexPath, indexTemplate({ reports }));
  }

  private cleanupOldReports(): void {
    const retentionMs = this.options.retentionDays! * 24 * 60 * 60 * 1000;
    const now = Date.now();

    fs.readdirSync(this.outputDir)
      .filter(file => file.match(/report-.*\.(html|json)$/))
      .forEach(file => {
        const filePath = path.join(this.outputDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > retentionMs) {
          fs.unlinkSync(filePath);
        }
      });
  }
}

// Standalone report generation function
export async function generateReport(
  testResults: Record<string, MetricData>,
  outputPath?: string
): Promise<void> {
  const reporter = new K6Reporter({ outputDir: outputPath });
  await reporter.generateReport(testResults);
}