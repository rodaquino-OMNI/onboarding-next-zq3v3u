import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, tap, catchError, retry, finalize } from 'rxjs/operators';
import { User, UserRole, UserPreferences, AuthenticatedUser } from '../interfaces/user.interface';
import { ApiService } from '../http/api.service';

/**
 * Comprehensive service for managing user-related operations in the AUSTA Integration Platform
 * Version: 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class UserService {
  private currentUserSubject: BehaviorSubject<AuthenticatedUser | null>;
  public currentUser$: Observable<AuthenticatedUser | null>;
  private loadingSubject: BehaviorSubject<boolean>;
  public loading$: Observable<boolean>;
  private maxRetryAttempts = 3;

  constructor(private apiService: ApiService) {
    this.currentUserSubject = new BehaviorSubject<AuthenticatedUser | null>(null);
    this.currentUser$ = this.currentUserSubject.asObservable();
    this.loadingSubject = new BehaviorSubject<boolean>(false);
    this.loading$ = this.loadingSubject.asObservable();
  }

  /**
   * Gets the current authenticated user state
   * @returns Current authenticated user or null
   */
  public getCurrentUser(): AuthenticatedUser | null {
    const currentUser = this.currentUserSubject.value;
    if (currentUser && new Date(currentUser.tokenExpiry) <= new Date()) {
      this.currentUserSubject.next(null);
      return null;
    }
    return currentUser;
  }

  /**
   * Loads user profile from the API with comprehensive error handling
   * @returns Observable of authenticated user profile
   */
  public loadUserProfile(): Observable<AuthenticatedUser> {
    this.loadingSubject.next(true);

    return this.apiService.get<AuthenticatedUser>('users/profile').pipe(
      retry({
        count: this.maxRetryAttempts,
        delay: this.getRetryDelay
      }),
      tap(user => {
        this.currentUserSubject.next(user);
      }),
      catchError(error => {
        if (error.code === 'ERR_AUTH') {
          this.currentUserSubject.next(null);
        }
        return throwError(() => error);
      }),
      finalize(() => {
        this.loadingSubject.next(false);
      })
    );
  }

  /**
   * Updates user preferences with validation
   * @param preferences Updated user preferences
   * @returns Observable of updated authenticated user
   */
  public updatePreferences(preferences: UserPreferences): Observable<AuthenticatedUser> {
    if (!this.getCurrentUser()) {
      return throwError(() => new Error('User not authenticated'));
    }

    this.loadingSubject.next(true);

    return this.apiService.put<AuthenticatedUser>('users/preferences', preferences).pipe(
      tap(user => {
        this.currentUserSubject.next(user);
      }),
      catchError(error => {
        if (error.code === 'ERR_VALIDATION') {
          return throwError(() => new Error('Invalid preference data'));
        }
        return throwError(() => error);
      }),
      finalize(() => {
        this.loadingSubject.next(false);
      })
    );
  }

  /**
   * Checks if current user has specific role with hierarchy support
   * @param role Role to check
   * @returns Boolean indicating if user has required role
   */
  public hasRole(role: UserRole): boolean {
    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const roleHierarchy = {
      [UserRole.Admin]: 4,
      [UserRole.Interviewer]: 3,
      [UserRole.Broker]: 2,
      [UserRole.Individual]: 1
    };

    const userRoleLevel = roleHierarchy[currentUser.user.role];
    const requiredRoleLevel = roleHierarchy[role];

    return userRoleLevel >= requiredRoleLevel;
  }

  /**
   * Updates user language preference
   * @param language New language preference
   * @returns Observable of success status
   */
  public updateLanguage(language: string): Observable<AuthenticatedUser> {
    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    const updatedPreferences: UserPreferences = {
      ...currentUser.user.preferences,
      language: language as any
    };

    return this.updatePreferences(updatedPreferences);
  }

  /**
   * Calculates retry delay using exponential backoff
   * @param retryCount Current retry attempt number
   * @returns Delay in milliseconds
   */
  private getRetryDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 10000);
  }

  /**
   * Validates user token expiration
   * @param user Authenticated user to validate
   * @returns Boolean indicating if token is valid
   */
  private isTokenValid(user: AuthenticatedUser): boolean {
    return new Date(user.tokenExpiry) > new Date();
  }
}