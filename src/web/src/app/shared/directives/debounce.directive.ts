import { 
  Directive, 
  ElementRef, 
  EventEmitter, 
  Input, 
  OnDestroy, 
  OnInit, 
  Output 
} from '@angular/core'; // ^15.0.0
import { 
  Subject, 
  Subscription, 
  fromEvent 
} from 'rxjs'; // ^7.5.0
import { 
  debounceTime, 
  takeUntil 
} from 'rxjs/operators'; // ^7.5.0

/**
 * Directive that adds configurable debounce functionality to input events
 * to optimize form performance and user experience.
 * 
 * @example
 * <input [appDebounce]="500" (debouncedEvent)="handleInput($event)">
 */
@Directive({
  selector: '[appDebounce]'
})
export class DebounceDirective implements OnInit, OnDestroy {
  // Subject for cleanup on component destroy
  private readonly destroy$ = new Subject<void>();

  // Subscription for event stream
  private eventSubscription: Subscription | null = null;

  // Configurable debounce time in milliseconds
  @Input('appDebounce')
  debounceTime = 300; // Default 300ms for optimal UX

  // Output event emitter for debounced events
  @Output()
  debouncedEvent = new EventEmitter<Event>();

  constructor(private readonly el: ElementRef) {}

  /**
   * Initializes the debounced event stream with proper error handling
   * and cleanup mechanisms.
   */
  ngOnInit(): void {
    try {
      // Create event stream from native element
      this.eventSubscription = fromEvent(this.el.nativeElement, 'input')
        .pipe(
          // Apply configurable debounce time
          debounceTime(this.debounceTime),
          // Ensure proper cleanup on destroy
          takeUntil(this.destroy$)
        )
        .subscribe({
          next: (event: Event) => {
            // Emit the debounced event
            this.debouncedEvent.emit(event);
          },
          error: (error: Error) => {
            console.error('Error in debounce directive:', error);
            // Attempt to recover by re-initializing the subscription
            this.ngOnInit();
          }
        });
    } catch (error) {
      console.error('Failed to initialize debounce directive:', error);
    }
  }

  /**
   * Performs thorough cleanup of subscriptions and subjects
   * to prevent memory leaks.
   */
  ngOnDestroy(): void {
    // Complete the destroy subject to trigger takeUntil
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up event subscription if it exists
    if (this.eventSubscription) {
      this.eventSubscription.unsubscribe();
      this.eventSubscription = null;
    }
  }
}