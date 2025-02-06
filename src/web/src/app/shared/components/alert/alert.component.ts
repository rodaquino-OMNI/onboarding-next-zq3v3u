import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject, timer, Subscription, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { NotificationService } from '../../../core/services/notification.service';
import { THEME_COLORS } from '../../../core/constants/app.constants';

// Alert animation configuration
const alertAnimations = trigger('alertState', [
  state('visible', style({
    opacity: 1,
    transform: 'translateY(0)'
  })),
  state('hidden', style({
    opacity: 0,
    transform: 'translateY(-100%)'
  })),
  transition('hidden => visible', [
    animate('200ms ease-out')
  ]),
  transition('visible => hidden', [
    animate('200ms ease-in')
  ])
]);

export type AlertType = 'success' | 'error' | 'warning' | 'info';
export type AlertPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

@Component({
  selector: 'app-alert',
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [alertAnimations]
})
export class AlertComponent implements OnInit, OnDestroy {
  @Input() message: string = '';
  @Input() translationKey: string = '';
  @Input() type: AlertType = 'info';
  @Input() dismissible: boolean = true;
  @Input() duration: number = 5000; // Duration in milliseconds
  @Input() position: AlertPosition = 'top-right';
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();
  private timerSubscription?: Subscription;
  private animationState$ = new BehaviorSubject<'visible' | 'hidden'>('visible');

  // Accessibility attributes
  ariaRole: string = 'alert';
  ariaLive: string = 'polite';

  constructor(
    private notificationService: NotificationService,
    private translateService: TranslateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Handle translation if key is provided
    if (this.translationKey) {
      this.translateService.get(this.translationKey)
        .pipe(takeUntil(this.destroy$))
        .subscribe(translatedMessage => {
          this.message = translatedMessage;
          this.cdr.markForCheck();
        });
    }

    // Set appropriate aria-live based on alert type
    this.ariaLive = this.type === 'error' ? 'assertive' : 'polite';

    // Auto-dismiss if duration is set and alert is not error type
    if (this.duration > 0 && this.type !== 'error') {
      this.timerSubscription = timer(this.duration)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.close());
    }

    // Initialize animation state
    this.animationState$.next('visible');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  close(): void {
    this.animationState$.next('hidden');
    
    // Wait for animation to complete before emitting close event
    setTimeout(() => {
      this.closed.emit();
      this.notificationService.markAsRead(this.message);
      this.cdr.markForCheck();
    }, 200);
  }

  getAlertClass(): string {
    const baseClass = 'alert';
    const typeClass = `alert-${this.type}`;
    const positionClass = `alert-${this.position}`;
    const animationClass = `alert-${this.animationState$.value}`;
    
    return `${baseClass} ${typeClass} ${positionClass} ${animationClass}`;
  }

  getIconClass(): string {
    switch (this.type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
      default:
        return 'info';
    }
  }

  getBackgroundColor(): string {
    switch (this.type) {
      case 'success':
        return THEME_COLORS.SUCCESS;
      case 'error':
        return THEME_COLORS.ERROR;
      case 'warning':
        return THEME_COLORS.WARNING;
      case 'info':
      default:
        return THEME_COLORS.INFO;
    }
  }

  handleSwipeDismiss(event: any): void {
    if (!this.dismissible) return;

    const SWIPE_THRESHOLD = 50;
    const deltaX = Math.abs(event.deltaX);
    
    if (deltaX > SWIPE_THRESHOLD) {
      this.close();
    }
  }
}