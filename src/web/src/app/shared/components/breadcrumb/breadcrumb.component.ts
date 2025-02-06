/**
 * @fileoverview Accessible breadcrumb navigation component with enrollment status tracking
 * Implements WCAG 2.1 Level AA standards and multi-language support
 * @version 1.0.0
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { Subscription, BehaviorSubject } from 'rxjs';
import { filter, distinctUntilChanged } from 'rxjs/operators';
import { TranslationService } from '@ngx-translate/core';
import { EnrollmentStatus } from '../../../core/interfaces/enrollment.interface';

// Route data key for breadcrumb configuration
const ROUTE_DATA_BREADCRUMB = 'breadcrumb';
const ENROLLMENT_ROUTE_PREFIX = '/enrollment/';

/**
 * Interface defining structure of breadcrumb navigation items
 * Includes accessibility attributes and enrollment status
 */
export interface BreadcrumbItem {
  label: string;
  url: string;
  status?: EnrollmentStatus;
  isActive: boolean;
  ariaLabel: string;
}

/**
 * Component that provides accessible breadcrumb navigation with enrollment status tracking
 * Implements WCAG 2.1 Level AA accessibility standards
 */
@Component({
  selector: 'app-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BreadcrumbComponent implements OnInit, OnDestroy {
  /**
   * Observable stream of breadcrumb items
   * Updates on route changes and enrollment status updates
   */
  public breadcrumbs$ = new BehaviorSubject<BreadcrumbItem[]>([]);

  private routerSubscription: Subscription;
  private statusSubscription: Subscription;

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private translationService: TranslationService
  ) {}

  /**
   * Initializes route change and status subscriptions
   * Sets up initial breadcrumb state
   */
  ngOnInit(): void {
    // Subscribe to router navigation events
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      distinctUntilChanged()
    ).subscribe(() => {
      const breadcrumbs = this.buildBreadcrumbs(this.activatedRoute.root, []);
      this.breadcrumbs$.next(breadcrumbs);
    });

    // Initialize breadcrumbs for current route
    const initialBreadcrumbs = this.buildBreadcrumbs(this.activatedRoute.root, []);
    this.breadcrumbs$.next(initialBreadcrumbs);
  }

  /**
   * Cleans up subscriptions on component destruction
   */
  ngOnDestroy(): void {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
    this.breadcrumbs$.complete();
  }

  /**
   * Builds accessible breadcrumb items from current route
   * Includes enrollment status tracking and localized labels
   * @param route Current activated route
   * @param url URL segments array
   * @returns Array of breadcrumb items with accessibility attributes
   */
  private buildBreadcrumbs(route: ActivatedRoute, url: string[]): BreadcrumbItem[] {
    const breadcrumbs: BreadcrumbItem[] = [];
    const children: ActivatedRoute[] = route.children;

    // Process each child route
    children.forEach(child => {
      // Extract route configuration
      const routeURL: string = child.snapshot.url.map(segment => segment.path).join('/');
      if (routeURL !== '') {
        url.push(routeURL);
      }

      // Get breadcrumb data from route
      const breadcrumbData = child.snapshot.data[ROUTE_DATA_BREADCRUMB];
      if (breadcrumbData) {
        // Build breadcrumb item
        const breadcrumbItem: BreadcrumbItem = {
          label: this.getLocalizedLabel(breadcrumbData.label),
          url: `/${url.join('/')}`,
          isActive: this.router.url === `/${url.join('/')}`,
          ariaLabel: this.getLocalizedLabel(breadcrumbData.ariaLabel || breadcrumbData.label)
        };

        // Add enrollment status if applicable
        if (url.join('/').startsWith(ENROLLMENT_ROUTE_PREFIX)) {
          const status = child.snapshot.params['status'];
          if (status && Object.values(EnrollmentStatus).includes(status)) {
            breadcrumbItem.status = status as EnrollmentStatus;
          }
        }

        breadcrumbs.push(breadcrumbItem);
      }

      // Process child routes recursively
      if (child.children.length > 0) {
        breadcrumbs.push(...this.buildBreadcrumbs(child, url));
      }
    });

    return breadcrumbs;
  }

  /**
   * Retrieves localized label for breadcrumb item
   * Provides fallback for missing translations
   * @param key Translation key
   * @returns Translated label text
   */
  private getLocalizedLabel(key: string): string {
    if (!key) {
      return '';
    }

    const translation = this.translationService.instant(`breadcrumbs.${key}`);
    return translation !== `breadcrumbs.${key}` ? translation : key;
  }
}