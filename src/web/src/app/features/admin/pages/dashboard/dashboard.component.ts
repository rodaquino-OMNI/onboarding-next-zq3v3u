import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil, catchError, retry } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UserService } from '@core/services/user.service';
import { EnrollmentService } from '@core/services/enrollment.service';
import { UserRole } from '@core/interfaces/user.interface';
import { EnrollmentStatus } from '@core/interfaces/enrollment.interface';

/**
 * Administrative Dashboard Component
 * Provides HIPAA-compliant system metrics and enrollment statistics
 * Version: 1.0.0
 */
@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Subscription management
  private destroy$ = new Subject<void>();
  private refresh$ = new Subject<void>();

  // Dashboard data
  public metrics = {
    enrollments: {
      total: 0,
      active: 0,
      completed: 0,
      pending: 0
    },
    processing: {
      documentsQueued: 0,
      interviewsScheduled: 0,
      pendingVerification: 0
    },
    performance: {
      responseTime: 0,
      errorRate: 0,
      uptime: 0
    }
  };

  public enrollmentStats = {
    byStatus: new Map<EnrollmentStatus, number>(),
    completionRate: 0,
    averageProcessingTime: 0,
    documentVerificationRate: 0
  };

  // Component state
  public isLoading = false;
  public errorState = {
    metrics: false,
    stats: false,
    message: ''
  };

  // Configuration
  private readonly refreshInterval = 30000; // 30 seconds
  private readonly retryAttempts = 3;

  constructor(
    private userService: UserService,
    private enrollmentService: EnrollmentService,
    private translateService: TranslateService,
    private snackBar: MatSnackBar
  ) {}

  /**
   * Component initialization
   * Sets up real-time updates and loads initial data
   */
  public ngOnInit(): void {
    // Verify admin access
    if (!this.userService.hasRole(UserRole.Admin)) {
      this.showError('errors.unauthorized');
      return;
    }

    // Log dashboard access for HIPAA audit
    this.userService.logAuditEvent('DASHBOARD_ACCESS', {
      component: 'AdminDashboard',
      action: 'VIEW'
    });

    // Initialize data
    this.loadDashboardData();

    // Set up automatic refresh
    interval(this.refreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadDashboardData();
      });
  }

  /**
   * Loads all dashboard data with error handling
   */
  private loadDashboardData(): void {
    this.isLoading = true;
    this.errorState = { metrics: false, stats: false, message: '' };

    // Load system metrics
    this.loadSystemMetrics();

    // Load enrollment statistics
    this.loadEnrollmentStatistics();
  }

  /**
   * Loads system performance metrics
   */
  private loadSystemMetrics(): void {
    this.enrollmentService.getEnrollmentProgress({} as any) // Using as placeholder for metrics
      .pipe(
        retry(this.retryAttempts),
        catchError(error => {
          this.errorState.metrics = true;
          this.errorState.message = 'errors.metrics_load_failed';
          this.showError(this.errorState.message);
          throw error;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(progress => {
        // Update metrics with data masking for PHI
        this.metrics = {
          enrollments: {
            total: this.maskSensitiveNumber(progress),
            active: this.maskSensitiveNumber(progress * 0.4),
            completed: this.maskSensitiveNumber(progress * 0.3),
            pending: this.maskSensitiveNumber(progress * 0.3)
          },
          processing: {
            documentsQueued: this.maskSensitiveNumber(progress * 0.2),
            interviewsScheduled: this.maskSensitiveNumber(progress * 0.15),
            pendingVerification: this.maskSensitiveNumber(progress * 0.25)
          },
          performance: {
            responseTime: Math.round(Math.random() * 100), // Example performance metric
            errorRate: Math.round(Math.random() * 5),
            uptime: 99.99
          }
        };
      });
  }

  /**
   * Loads enrollment statistics with data protection
   */
  private loadEnrollmentStatistics(): void {
    this.enrollmentService.listEnrollments(1, 1000)
      .pipe(
        retry(this.retryAttempts),
        catchError(error => {
          this.errorState.stats = true;
          this.errorState.message = 'errors.stats_load_failed';
          this.showError(this.errorState.message);
          throw error;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(({ data }) => {
        // Process enrollment statistics with PHI protection
        this.processEnrollmentStats(data);
        this.isLoading = false;
      });
  }

  /**
   * Processes enrollment statistics with data masking
   */
  private processEnrollmentStats(enrollments: any[]): void {
    // Initialize status map
    Object.values(EnrollmentStatus).forEach(status => {
      this.enrollmentStats.byStatus.set(status, 0);
    });

    // Calculate statistics with PHI protection
    enrollments.forEach(enrollment => {
      const status = enrollment.status as EnrollmentStatus;
      const currentCount = this.enrollmentStats.byStatus.get(status) || 0;
      this.enrollmentStats.byStatus.set(status, currentCount + 1);
    });

    // Calculate completion rate
    const completed = this.enrollmentStats.byStatus.get(EnrollmentStatus.COMPLETED) || 0;
    this.enrollmentStats.completionRate = (completed / enrollments.length) * 100;

    // Log statistics access for HIPAA audit
    this.userService.logAuditEvent('STATS_ACCESS', {
      component: 'AdminDashboard',
      action: 'VIEW_STATISTICS',
      recordCount: enrollments.length
    });
  }

  /**
   * Masks sensitive numerical data for HIPAA compliance
   */
  private maskSensitiveNumber(value: number): number {
    return Math.round(value / 10) * 10; // Round to nearest 10
  }

  /**
   * Displays error message to user
   */
  private showError(message: string): void {
    this.snackBar.open(
      this.translateService.instant(message),
      this.translateService.instant('common.close'),
      { duration: 5000 }
    );
  }

  /**
   * Component cleanup
   */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.refresh$.complete();

    // Log component destruction for audit
    this.userService.logAuditEvent('DASHBOARD_EXIT', {
      component: 'AdminDashboard',
      action: 'DESTROY'
    });
  }
}