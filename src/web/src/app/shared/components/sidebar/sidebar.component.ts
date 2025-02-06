import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, Subject, takeUntil, filter } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ThemeService } from '@core/services/theme.service';
import { StorageService } from '@core/services/storage.service';
import { UserRole } from '@core/interfaces/user.interface';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  children?: MenuItem[];
  roles: UserRole[];
  ariaLabel: string;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent implements OnInit, OnDestroy {
  isCollapsed = false;
  currentTheme: 'light' | 'dark' = 'light';
  menuItems: MenuItem[] = [];
  isKeyboardFocused = false;
  currentUserRole: UserRole | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly storageKey = 'sidebar_state';

  constructor(
    private authService: AuthService,
    private themeService: ThemeService,
    private router: Router,
    private storageService: StorageService
  ) {}

  ngOnInit(): void {
    // Initialize theme
    this.themeService.getCurrentTheme()
      .pipe(takeUntil(this.destroy$))
      .subscribe(theme => {
        this.currentTheme = theme;
      });

    // Load saved sidebar state
    this.storageService.getItem<boolean>(this.storageKey, Boolean)
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        if (state !== null) {
          this.isCollapsed = state;
        }
      });

    // Initialize menu items based on user role
    this.initializeMenuItems();

    // Handle route changes
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (window.innerWidth < 768) {
          this.isCollapsed = true;
        }
      });

    // Set up keyboard navigation
    this.setupKeyboardNavigation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.storageService.setItem(this.storageKey, this.isCollapsed).subscribe();

    // Update ARIA attributes
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.setAttribute('aria-expanded', (!this.isCollapsed).toString());
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  private initializeMenuItems(): void {
    const baseMenuItems: MenuItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: 'dashboard',
        route: '/dashboard',
        roles: [UserRole.Individual, UserRole.Broker, UserRole.Interviewer, UserRole.Admin],
        ariaLabel: 'Navigate to dashboard'
      },
      {
        id: 'enrollments',
        label: 'Enrollments',
        icon: 'assignment',
        route: '/enrollments',
        roles: [UserRole.Individual, UserRole.Broker, UserRole.Admin],
        ariaLabel: 'Manage enrollments'
      },
      {
        id: 'interviews',
        label: 'Interviews',
        icon: 'videocam',
        route: '/interviews',
        roles: [UserRole.Interviewer, UserRole.Admin],
        ariaLabel: 'Manage interviews'
      },
      {
        id: 'documents',
        label: 'Documents',
        icon: 'description',
        route: '/documents',
        roles: [UserRole.Individual, UserRole.Broker, UserRole.Admin],
        ariaLabel: 'Access documents'
      },
      {
        id: 'admin',
        label: 'Administration',
        icon: 'admin_panel_settings',
        roles: [UserRole.Admin],
        ariaLabel: 'Access administration',
        children: [
          {
            id: 'users',
            label: 'Users',
            icon: 'people',
            route: '/admin/users',
            roles: [UserRole.Admin],
            ariaLabel: 'Manage users'
          },
          {
            id: 'settings',
            label: 'Settings',
            icon: 'settings',
            route: '/admin/settings',
            roles: [UserRole.Admin],
            ariaLabel: 'System settings'
          }
        ]
      }
    ];

    // Filter menu items based on user role
    this.authService.getCurrentUserRole()
      .pipe(takeUntil(this.destroy$))
      .subscribe(role => {
        this.currentUserRole = role;
        this.menuItems = this.filterMenuItemsByRole(baseMenuItems, role);
      });
  }

  private filterMenuItemsByRole(items: MenuItem[], role: UserRole): MenuItem[] {
    return items.filter(item => {
      const hasAccess = item.roles.includes(role);
      if (hasAccess && item.children) {
        item.children = this.filterMenuItemsByRole(item.children, role);
      }
      return hasAccess;
    });
  }

  private setupKeyboardNavigation(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        this.isKeyboardFocused = true;
      }
    });

    document.addEventListener('mousedown', () => {
      this.isKeyboardFocused = false;
    });
  }

  isRouteActive(route: string): boolean {
    return this.router.isActive(route, {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored'
    });
  }

  onMenuItemClick(item: MenuItem): void {
    if (item.route) {
      this.router.navigate([item.route]);
      if (window.innerWidth < 768) {
        this.isCollapsed = true;
      }
    }
  }
}