/**
 * @fileoverview Angular service for managing application theming with system preference detection,
 * manual override capabilities, and WCAG AAA compliance validation
 * @version 1.0.0
 */

import { Injectable } from '@angular/core'; // ^15.0.0
import { BehaviorSubject, Observable, Subject } from 'rxjs'; // ^7.5.0
import { map, debounceTime } from 'rxjs/operators'; // ^7.5.0
import { StorageService } from './storage.service';
import { THEME_COLORS, APP_CONFIG } from '../constants/app.constants';

// Theme type definition
export type Theme = 'light' | 'dark';

// Constants
const THEME_STORAGE_KEY = 'austa-theme-preference';
const SYSTEM_DARK_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const THEME_CHANGE_EVENT = 'austa-theme-changed';
const THEME_CHANGE_DEBOUNCE = 100; // milliseconds

// WCAG AAA contrast ratio requirements
const WCAG_AAA_CONTRAST_RATIO = {
  NORMAL_TEXT: 7,
  LARGE_TEXT: 4.5
};

/**
 * Service responsible for managing application theming with system preference detection,
 * manual override capabilities, and WCAG compliance validation
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly themeSubject: BehaviorSubject<Theme>;
  private readonly systemThemeMediaQuery: MediaQueryList;
  private readonly themeChangeDebouncer: Subject<Theme>;

  constructor(private readonly storageService: StorageService) {
    // Initialize theme subject with stored preference or default
    this.themeSubject = new BehaviorSubject<Theme>(APP_CONFIG.DEFAULT_THEME as Theme);
    this.themeChangeDebouncer = new Subject<Theme>();

    // Set up system theme detection
    this.systemThemeMediaQuery = window.matchMedia(SYSTEM_DARK_THEME_MEDIA_QUERY);

    // Initialize theme from storage or system preference
    this.initializeTheme();

    // Set up theme change debouncer
    this.themeChangeDebouncer
      .pipe(debounceTime(THEME_CHANGE_DEBOUNCE))
      .subscribe((theme: Theme) => {
        this.applyTheme(theme);
      });

    // Listen for system theme changes
    this.systemThemeMediaQuery.addEventListener('change', (e: MediaQueryListEvent) => {
      if (!this.hasStoredThemePreference()) {
        const newTheme: Theme = e.matches ? 'dark' : 'light';
        this.themeChangeDebouncer.next(newTheme);
      }
    });
  }

  /**
   * Gets the current active theme as an observable
   * @returns Observable of current theme
   */
  public getCurrentTheme(): Observable<Theme> {
    return this.themeSubject.asObservable();
  }

  /**
   * Sets and persists theme preference with WCAG validation
   * @param theme Theme to set
   */
  public setTheme(theme: Theme): void {
    try {
      // Validate WCAG compliance
      this.validateWCAGCompliance(theme);

      // Update theme subject
      this.themeSubject.next(theme);

      // Persist theme preference
      this.storageService.setItem(THEME_STORAGE_KEY, theme).subscribe({
        next: () => this.themeChangeDebouncer.next(theme),
        error: (error) => {
          console.error('Failed to persist theme preference:', error);
          // Revert to default theme on error
          this.themeChangeDebouncer.next(APP_CONFIG.DEFAULT_THEME as Theme);
        }
      });
    } catch (error) {
      console.error('Theme application failed:', error);
      this.themeChangeDebouncer.next(APP_CONFIG.DEFAULT_THEME as Theme);
    }
  }

  /**
   * Toggles between light and dark themes
   */
  public toggleTheme(): void {
    const currentTheme = this.themeSubject.getValue();
    const newTheme: Theme = currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  /**
   * Initializes theme from storage or system preference
   * @private
   */
  private initializeTheme(): void {
    this.storageService.getItem<Theme>(THEME_STORAGE_KEY, String).subscribe({
      next: (storedTheme) => {
        if (storedTheme) {
          this.themeChangeDebouncer.next(storedTheme);
        } else {
          const systemTheme: Theme = this.systemThemeMediaQuery.matches ? 'dark' : 'light';
          this.themeChangeDebouncer.next(systemTheme);
        }
      },
      error: () => {
        // Fall back to system preference on error
        const systemTheme: Theme = this.systemThemeMediaQuery.matches ? 'dark' : 'light';
        this.themeChangeDebouncer.next(systemTheme);
      }
    });
  }

  /**
   * Checks if there is a stored theme preference
   * @private
   * @returns boolean indicating if theme preference exists
   */
  private hasStoredThemePreference(): boolean {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  }

  /**
   * Applies theme classes and styles with cross-framework support
   * @private
   * @param theme Theme to apply
   */
  private applyTheme(theme: Theme): void {
    try {
      const body = document.body;
      const root = document.documentElement;

      // Remove existing theme classes
      body.classList.remove('theme-light', 'theme-dark');
      root.classList.remove('theme-light', 'theme-dark');

      // Add new theme class
      const themeClass = `theme-${theme}`;
      body.classList.add(themeClass);
      root.classList.add(themeClass);

      // Update CSS variables for cross-framework support
      this.updateThemeVariables(theme);

      // Dispatch theme change event
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }));
    } catch (error) {
      console.error('Theme application failed:', error);
      throw error;
    }
  }

  /**
   * Updates CSS variables for theme colors
   * @private
   * @param theme Current theme
   */
  private updateThemeVariables(theme: Theme): void {
    const root = document.documentElement;
    const colors = THEME_COLORS;

    root.style.setProperty('--primary-color', colors.PRIMARY);
    root.style.setProperty('--secondary-color', colors.SECONDARY);
    root.style.setProperty('--background-color', 
      theme === 'light' ? colors.BACKGROUND.LIGHT : colors.BACKGROUND.DARK);
    root.style.setProperty('--text-color',
      theme === 'light' ? colors.TEXT.PRIMARY : colors.TEXT.SECONDARY);
  }

  /**
   * Validates theme colors against WCAG AAA contrast requirements
   * @private
   * @param theme Theme to validate
   * @throws Error if contrast requirements are not met
   */
  private validateWCAGCompliance(theme: Theme): void {
    const colors = THEME_COLORS;
    const backgroundColor = theme === 'light' ? colors.BACKGROUND.LIGHT : colors.BACKGROUND.DARK;
    const textColor = theme === 'light' ? colors.TEXT.PRIMARY : colors.TEXT.SECONDARY;

    const contrastRatio = this.calculateContrastRatio(backgroundColor, textColor);

    if (contrastRatio < WCAG_AAA_CONTRAST_RATIO.NORMAL_TEXT) {
      throw new Error(`Contrast ratio ${contrastRatio} does not meet WCAG AAA requirements`);
    }
  }

  /**
   * Calculates contrast ratio between two colors
   * @private
   * @param color1 First color
   * @param color2 Second color
   * @returns Contrast ratio
   */
  private calculateContrastRatio(color1: string, color2: string): number {
    const luminance1 = this.calculateRelativeLuminance(color1);
    const luminance2 = this.calculateRelativeLuminance(color2);

    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Calculates relative luminance of a color
   * @private
   * @param color Color in hex format
   * @returns Relative luminance value
   */
  private calculateRelativeLuminance(color: string): number {
    const rgb = this.hexToRgb(color);
    const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(val => {
      return val <= 0.03928
        ? val / 12.92
        : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Converts hex color to RGB values
   * @private
   * @param hex Hex color string
   * @returns RGB color object
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
}