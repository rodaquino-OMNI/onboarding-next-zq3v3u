import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, interval } from 'rxjs';
import { map, tap, catchError, retry, takeUntil, switchMap } from 'rxjs/operators';
import { ApiService } from '../http/api.service';
import { API_ENDPOINTS } from '../constants/api.constants';
import { UserPreferences } from '../interfaces/user.interface';

/**
 * Interface for notification data structure
 */
export interface Notification {
  id: string;
  type: 'enrollment' | 'interview' | 'document' | 'system';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

/**
 * Interface for notification filtering
 */
export interface NotificationFilter {
  type?: string[];
  read?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Interface for notification sorting
 */
export interface NotificationSort {
  field: 'createdAt' | 'type';
  direction: 'asc' | 'desc';
}

/**
 * Service responsible for managing application notifications
 * Provides real-time updates and configurable delivery preferences
 * @version 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications$ = new BehaviorSubject<Notification[]>([]);
  private unreadCount$ = new BehaviorSubject<number>(0);
  private destroy$ = new Subject<void>();
  private pollingInterval: number;
  private readonly DEFAULT_POLLING_INTERVAL = 30000; // 30 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor(
    private apiService: ApiService,
    private userPreferences: UserPreferences
  ) {
    this.pollingInterval = this.userPreferences.notifications?.inApp ? 
      this.DEFAULT_POLLING_INTERVAL : 60000; // 1 minute if not prioritized
    this.startPolling();
  }

  /**
   * Retrieves notifications with optional filtering and sorting
   */
  public getNotifications(
    filter?: NotificationFilter,
    sort?: NotificationSort
  ): Observable<Notification[]> {
    const params = this.buildQueryParams(filter, sort);
    
    return this.apiService.get<Notification[]>(
      API_ENDPOINTS.NOTIFICATIONS,
      params
    ).pipe(
      retry(this.MAX_RETRY_ATTEMPTS),
      tap(notifications => {
        this.notifications$.next(notifications);
        this.updateUnreadCount(notifications);
      }),
      catchError(error => {
        console.error('Error fetching notifications:', error);
        return this.notifications$; // Return cached notifications on error
      })
    );
  }

  /**
   * Returns the current unread notification count
   */
  public getUnreadCount(): Observable<number> {
    return this.unreadCount$.asObservable();
  }

  /**
   * Marks a notification as read and updates the local state
   */
  public markAsRead(notificationId: string): Observable<void> {
    return this.apiService.post<void>(
      `${API_ENDPOINTS.NOTIFICATIONS}/${notificationId}/read`,
      {}
    ).pipe(
      tap(() => {
        const currentNotifications = this.notifications$.value;
        const updatedNotifications = currentNotifications.map(notification => 
          notification.id === notificationId 
            ? { ...notification, read: true }
            : notification
        );
        
        this.notifications$.next(updatedNotifications);
        this.updateUnreadCount(updatedNotifications);
      }),
      retry(this.MAX_RETRY_ATTEMPTS)
    );
  }

  /**
   * Marks all notifications as read
   */
  public markAllAsRead(): Observable<void> {
    return this.apiService.post<void>(
      `${API_ENDPOINTS.NOTIFICATIONS}/read-all`,
      {}
    ).pipe(
      tap(() => {
        const updatedNotifications = this.notifications$.value.map(notification => ({
          ...notification,
          read: true
        }));
        
        this.notifications$.next(updatedNotifications);
        this.unreadCount$.next(0);
      }),
      retry(this.MAX_RETRY_ATTEMPTS)
    );
  }

  /**
   * Updates the notification polling interval
   */
  public updatePollingInterval(interval: number): void {
    if (interval < 5000) { // Minimum 5 seconds
      interval = 5000;
    }
    
    this.pollingInterval = interval;
    this.startPolling(); // Restart polling with new interval
  }

  /**
   * Cleans up resources on service destruction
   */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Starts the notification polling mechanism
   */
  private startPolling(): void {
    // Cancel any existing polling
    this.destroy$.next();

    // Start new polling interval
    interval(this.pollingInterval).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.getNotifications())
    ).subscribe();
  }

  /**
   * Updates the unread notification count
   */
  private updateUnreadCount(notifications: Notification[]): void {
    const unreadCount = notifications.filter(n => !n.read).length;
    this.unreadCount$.next(unreadCount);
  }

  /**
   * Builds query parameters for notification requests
   */
  private buildQueryParams(
    filter?: NotificationFilter,
    sort?: NotificationSort
  ): Record<string, any> {
    const params: Record<string, any> = {};

    if (filter) {
      if (filter.type?.length) {
        params.types = filter.type.join(',');
      }
      if (filter.read !== undefined) {
        params.read = filter.read;
      }
      if (filter.startDate) {
        params.startDate = filter.startDate.toISOString();
      }
      if (filter.endDate) {
        params.endDate = filter.endDate.toISOString();
      }
    }

    if (sort) {
      params.sortField = sort.field;
      params.sortDirection = sort.direction;
    }

    return params;
  }
}