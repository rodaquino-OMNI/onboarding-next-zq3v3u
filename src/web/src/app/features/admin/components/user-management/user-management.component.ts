import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, map, catchError, finalize, distinctUntilChanged } from 'rxjs/operators';
import { ScrollingModule, ScrollDispatcher, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { ViewChild } from '@angular/core';

import { User, UserRole, UserPreferences, UserAudit } from '../../../../core/interfaces/user.interface';
import { UserService } from '../../../../core/services/user.service';

interface UserWithAudit {
  user: User;
  audit: UserAudit[];
  isEditing: boolean;
}

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserManagementComponent implements OnInit, OnDestroy {
  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;

  // Reactive streams
  public users$ = new BehaviorSubject<UserWithAudit[]>([]);
  public loading$ = new BehaviorSubject<boolean>(false);
  public error$ = new BehaviorSubject<string | null>(null);
  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedRole$ = new BehaviorSubject<UserRole | null>(null);

  // Component state
  public readonly pageSize = 20;
  public readonly userRoles = UserRole;
  private currentPage = 0;
  private destroy$ = new Subject<void>();

  // Role-based permissions matrix
  private readonly rolePermissions = new Map<UserRole, string[]>([
    [UserRole.Admin, ['create', 'read', 'update', 'delete', 'audit']],
    [UserRole.Interviewer, ['read', 'update']],
    [UserRole.Broker, ['read']],
    [UserRole.Individual, ['read']]
  ]);

  constructor(
    private userService: UserService,
    private scrollDispatcher: ScrollDispatcher,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeScrolling();
    this.loadInitialData();
    this.setupSearchFilter();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads users with pagination and virtual scrolling support
   */
  private loadUsers(page: number): void {
    if (!this.hasPermission('read')) {
      this.error$.next('Insufficient permissions');
      return;
    }

    this.loading$.next(true);

    this.userService.loadUserProfile()
      .pipe(
        takeUntil(this.destroy$),
        map(users => this.mapUsersWithAudit(users)),
        catchError(error => {
          this.error$.next(error.message);
          return [];
        }),
        finalize(() => {
          this.loading$.next(false);
          this.changeDetector.markForCheck();
        })
      )
      .subscribe(users => {
        const currentUsers = this.users$.value;
        this.users$.next([...currentUsers, ...users]);
      });
  }

  /**
   * Updates user data with audit logging
   */
  public updateUser(user: User): void {
    if (!this.hasPermission('update')) {
      this.error$.next('Insufficient permissions');
      return;
    }

    this.loading$.next(true);

    const auditEntry: UserAudit = {
      userId: user.id,
      action: 'update',
      timestamp: new Date(),
      changes: this.generateAuditChanges(user)
    };

    this.userService.updateUserProfile(user)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.error$.next(error.message);
          throw error;
        }),
        finalize(() => {
          this.loading$.next(false);
          this.changeDetector.markForCheck();
        })
      )
      .subscribe(() => {
        this.updateUserInList(user);
        this.logAuditEntry(auditEntry);
      });
  }

  /**
   * Updates user preferences
   */
  public updateUserPreferences(userId: string, preferences: UserPreferences): void {
    if (!this.hasPermission('update')) {
      this.error$.next('Insufficient permissions');
      return;
    }

    this.loading$.next(true);

    this.userService.updatePreferences(preferences)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.error$.next(error.message);
          throw error;
        }),
        finalize(() => {
          this.loading$.next(false);
          this.changeDetector.markForCheck();
        })
      )
      .subscribe(() => {
        this.updateUserPreferencesInList(userId, preferences);
      });
  }

  /**
   * Checks if current user has required permission
   */
  private hasPermission(action: string): boolean {
    const currentUser = this.userService.getCurrentUser();
    if (!currentUser) return false;

    const userRole = currentUser.user.role;
    const permissions = this.rolePermissions.get(userRole);
    return permissions?.includes(action) || false;
  }

  /**
   * Sets up virtual scrolling
   */
  private initializeScrolling(): void {
    this.scrollDispatcher.scrolled()
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(() => {
        if (this.viewport && this.viewport.measureScrollOffset('bottom') < 100) {
          this.currentPage++;
          this.loadUsers(this.currentPage);
        }
      });
  }

  /**
   * Sets up search filtering
   */
  private setupSearchFilter(): void {
    combineLatest([this.searchTerm$, this.selectedRole$])
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(([search, role]) => {
        const filteredUsers = this.filterUsers(search, role);
        this.users$.next(filteredUsers);
      });
  }

  /**
   * Filters users based on search term and role
   */
  private filterUsers(search: string, role: UserRole | null): UserWithAudit[] {
    return this.users$.value.filter(userWithAudit => {
      const user = userWithAudit.user;
      const matchesSearch = !search || 
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = !role || user.role === role;
      return matchesSearch && matchesRole;
    });
  }

  /**
   * Maps users with their audit history
   */
  private mapUsersWithAudit(users: User[]): UserWithAudit[] {
    return users.map(user => ({
      user,
      audit: [],
      isEditing: false
    }));
  }

  /**
   * Updates user in the list
   */
  private updateUserInList(updatedUser: User): void {
    const users = this.users$.value;
    const index = users.findIndex(u => u.user.id === updatedUser.id);
    if (index !== -1) {
      users[index].user = updatedUser;
      this.users$.next([...users]);
    }
  }

  /**
   * Updates user preferences in the list
   */
  private updateUserPreferencesInList(userId: string, preferences: UserPreferences): void {
    const users = this.users$.value;
    const index = users.findIndex(u => u.user.id === userId);
    if (index !== -1) {
      users[index].user.preferences = preferences;
      this.users$.next([...users]);
    }
  }

  /**
   * Generates audit changes
   */
  private generateAuditChanges(user: User): Record<string, any> {
    const originalUser = this.users$.value.find(u => u.user.id === user.id)?.user;
    if (!originalUser) return {};

    const changes: Record<string, any> = {};
    Object.keys(user).forEach(key => {
      if (JSON.stringify(user[key]) !== JSON.stringify(originalUser[key])) {
        changes[key] = {
          from: originalUser[key],
          to: user[key]
        };
      }
    });
    return changes;
  }

  /**
   * Logs audit entry
   */
  private logAuditEntry(audit: UserAudit): void {
    const users = this.users$.value;
    const index = users.findIndex(u => u.user.id === audit.userId);
    if (index !== -1) {
      users[index].audit = [audit, ...users[index].audit];
      this.users$.next([...users]);
    }
  }
}