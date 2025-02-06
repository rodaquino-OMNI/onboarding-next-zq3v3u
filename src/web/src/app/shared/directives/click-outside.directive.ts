import { 
  Directive, 
  ElementRef, 
  EventEmitter, 
  HostListener, 
  Output, 
  OnDestroy, 
  Renderer2 
} from '@angular/core'; // @angular/core ^15.0.0

/**
 * Enhanced directive that detects clicks, touches, and keyboard events outside 
 * of the host element with full accessibility support.
 * Implements WCAG 2.1 Level AA compliance with keyboard navigation.
 */
@Directive({
  selector: '[appClickOutside]'
})
export class ClickOutsideDirective implements OnDestroy {
  /**
   * Event emitted when a click/touch/keyboard event is detected outside the host element
   */
  @Output() clickOutside = new EventEmitter<void>();

  /**
   * Controls whether the directive is actively listening for outside events
   */
  private _isEnabled = true;
  public get isEnabled(): boolean {
    return this._isEnabled;
  }
  public set isEnabled(value: boolean) {
    this._isEnabled = value;
  }

  /**
   * Set of elements to exclude from outside click detection
   */
  private excludedElements: Set<HTMLElement> = new Set();

  /**
   * Reference to the host element's native element
   */
  private element: HTMLElement;

  constructor(
    private elementRef: ElementRef,
    private renderer: Renderer2
  ) {
    this.element = this.elementRef.nativeElement;
  }

  /**
   * Handles document click and touch events
   * Includes support for Shadow DOM traversal and excluded elements
   * @param event The mouse or touch event
   */
  @HostListener('document:click', ['$event'])
  @HostListener('document:touchend', ['$event'])
  onClick(event: Event): void {
    if (!this._isEnabled) {
      return;
    }

    // Get the actual target element, handling Shadow DOM
    let targetElement = event.target as HTMLElement;
    
    // Traverse up through Shadow DOM boundaries
    while (targetElement && targetElement.getRootNode() instanceof ShadowRoot) {
      targetElement = (targetElement.getRootNode() as ShadowRoot).host as HTMLElement;
    }

    // Check if click was outside and not on excluded elements
    if (targetElement && !this.element.contains(targetElement) && 
        !this.isExcludedElement(targetElement)) {
      this.clickOutside.emit();
    }
  }

  /**
   * Handles keyboard escape key events for accessibility
   * @param event The keyboard event
   */
  @HostListener('document:keydown.escape', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this._isEnabled) {
      return;
    }

    if (event.key === 'Escape' || event.key === 'Esc') {
      this.clickOutside.emit();
    }
  }

  /**
   * Checks if an element is in the excluded elements set
   * @param element Element to check
   * @returns boolean indicating if element is excluded
   */
  private isExcludedElement(element: HTMLElement): boolean {
    let current = element;
    
    // Check element and its ancestors
    while (current) {
      if (this.excludedElements.has(current)) {
        return true;
      }
      current = current.parentElement as HTMLElement;
    }
    
    return false;
  }

  /**
   * Adds an element to the excluded elements set
   * @param element Element to exclude from outside click detection
   */
  public addExcludedElement(element: HTMLElement): void {
    if (element) {
      this.excludedElements.add(element);
    }
  }

  /**
   * Removes an element from the excluded elements set
   * @param element Element to remove from exclusion
   */
  public removeExcludedElement(element: HTMLElement): void {
    if (element) {
      this.excludedElements.delete(element);
    }
  }

  /**
   * Cleanup when directive is destroyed
   */
  ngOnDestroy(): void {
    this.excludedElements.clear();
    this.element = null as any;
  }
}