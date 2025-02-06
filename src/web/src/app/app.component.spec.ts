import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing'; // ^15.0.0
import { BehaviorSubject, Subject } from 'rxjs'; // ^7.5.0
import { AppComponent } from './app.component';
import { ThemeService } from './core/services/theme.service';
import { Theme } from './core/interfaces/user.interface';
import { UI_CONSTANTS, THEME_COLORS } from './core/constants/app.constants';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let themeServiceMock: jasmine.SpyObj<ThemeService>;
  let destroySubject: Subject<void>;
  let themeSubject: BehaviorSubject<Theme>;

  // Constants for testing
  const MOBILE_BREAKPOINT = UI_CONSTANTS.BREAKPOINTS.MOBILE;
  const TABLET_BREAKPOINT = UI_CONSTANTS.BREAKPOINTS.TABLET;
  const DESKTOP_BREAKPOINT = UI_CONSTANTS.BREAKPOINTS.DESKTOP;
  const THEME_CHANGE_TIMEOUT = 100;

  beforeEach(async () => {
    // Initialize theme subject for testing
    themeSubject = new BehaviorSubject<Theme>('light');
    destroySubject = new Subject<void>();

    // Create ThemeService mock with required methods
    themeServiceMock = jasmine.createSpyObj('ThemeService', [
      'getCurrentTheme',
      'setTheme',
      'detectSystemPreference',
      'validateWCAGCompliance'
    ]);

    // Configure mock behavior
    themeServiceMock.getCurrentTheme.and.returnValue(themeSubject.asObservable());
    themeServiceMock.detectSystemPreference.and.returnValue('light');
    themeServiceMock.validateWCAGCompliance.and.returnValue(true);

    // Configure TestBed
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      providers: [
        { provide: ThemeService, useValue: themeServiceMock }
      ]
    }).compileComponents();

    // Create component instance
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;

    // Spy on window resize event
    spyOn(window, 'addEventListener').and.callThrough();
    spyOn(window, 'removeEventListener').and.callThrough();
  });

  afterEach(() => {
    // Cleanup
    destroySubject.next();
    destroySubject.complete();
    fixture.destroy();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
    expect(themeServiceMock.getCurrentTheme).toHaveBeenCalled();
  });

  describe('Layout Structure', () => {
    it('should initialize with correct layout elements', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;

      expect(compiled.querySelector('app-header')).toBeTruthy();
      expect(compiled.querySelector('app-sidebar')).toBeTruthy();
      expect(compiled.querySelector('main')).toBeTruthy();
      expect(compiled.querySelector('app-footer')).toBeTruthy();
    });

    it('should maintain proper layout hierarchy', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const mainContent = compiled.querySelector('main');

      expect(mainContent.parentElement.tagName.toLowerCase()).toBe('div');
      expect(mainContent.classList.contains('content-area')).toBeTrue();
    });
  });

  describe('Responsive Design', () => {
    it('should handle mobile layout', fakeAsync(() => {
      // Set viewport to mobile size
      setViewportSize(MOBILE_BREAKPOINT - 1);
      window.dispatchEvent(new Event('resize'));
      tick(100);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.mobile-layout')).toBeTruthy();
      expect(compiled.querySelector('.desktop-layout')).toBeFalsy();
    }));

    it('should handle tablet layout', fakeAsync(() => {
      // Set viewport to tablet size
      setViewportSize(TABLET_BREAKPOINT - 1);
      window.dispatchEvent(new Event('resize'));
      tick(100);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.tablet-layout')).toBeTruthy();
      expect(compiled.querySelector('.mobile-layout')).toBeFalsy();
    }));

    it('should handle desktop layout', fakeAsync(() => {
      // Set viewport to desktop size
      setViewportSize(DESKTOP_BREAKPOINT + 1);
      window.dispatchEvent(new Event('resize'));
      tick(100);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.desktop-layout')).toBeTruthy();
      expect(compiled.querySelector('.tablet-layout')).toBeFalsy();
    }));

    it('should handle orientation changes', fakeAsync(() => {
      // Simulate orientation change
      window.dispatchEvent(new Event('orientationchange'));
      tick(100);
      fixture.detectChanges();

      expect(component['handleOrientationChange']).toHaveBeenCalled();
    }));
  });

  describe('Theme Management', () => {
    it('should initialize with correct theme and WCAG compliance', fakeAsync(() => {
      fixture.detectChanges();
      tick(THEME_CHANGE_TIMEOUT);

      expect(themeServiceMock.getCurrentTheme).toHaveBeenCalled();
      expect(themeServiceMock.validateWCAGCompliance).toHaveBeenCalled();
    }));

    it('should handle theme changes with WCAG validation', fakeAsync(() => {
      fixture.detectChanges();
      
      // Simulate theme change
      themeSubject.next('dark');
      tick(THEME_CHANGE_TIMEOUT);
      fixture.detectChanges();

      expect(themeServiceMock.validateWCAGCompliance).toHaveBeenCalledWith('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    }));

    it('should validate contrast ratios for accessibility', fakeAsync(() => {
      const validateContrastSpy = spyOn<any>(component, 'validateContrast');
      fixture.detectChanges();
      
      themeSubject.next('light');
      tick(THEME_CHANGE_TIMEOUT);

      expect(validateContrastSpy).toHaveBeenCalled();
      expect(themeServiceMock.validateWCAGCompliance).toHaveBeenCalled();
    }));

    it('should handle system theme preference changes', fakeAsync(() => {
      const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      fixture.detectChanges();

      // Simulate system theme change
      mediaQueryList.dispatchEvent(new Event('change'));
      tick(THEME_CHANGE_TIMEOUT);

      expect(themeServiceMock.detectSystemPreference).toHaveBeenCalled();
    }));
  });

  describe('Error Handling', () => {
    it('should handle theme service errors gracefully', fakeAsync(() => {
      themeServiceMock.getCurrentTheme.and.throwError('Theme service error');
      fixture.detectChanges();
      tick(THEME_CHANGE_TIMEOUT);

      // Should fallback to default theme
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    }));

    it('should handle WCAG compliance failures', fakeAsync(() => {
      themeServiceMock.validateWCAGCompliance.and.throwError('WCAG validation failed');
      fixture.detectChanges();
      tick(THEME_CHANGE_TIMEOUT);

      // Should maintain current theme
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    }));
  });

  describe('Lifecycle Hooks', () => {
    it('should clean up subscriptions on destroy', () => {
      const unsubscribeSpy = spyOn(Subject.prototype, 'unsubscribe');
      fixture.detectChanges();
      
      component.ngOnDestroy();
      
      expect(unsubscribeSpy).toHaveBeenCalled();
    });

    it('should remove event listeners on destroy', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      
      expect(window.removeEventListener).toHaveBeenCalledWith('resize', jasmine.any(Function));
      expect(window.removeEventListener).toHaveBeenCalledWith('orientationchange', jasmine.any(Function));
    });
  });

  // Helper function to simulate viewport size changes
  function setViewportSize(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width
    });
  }
});