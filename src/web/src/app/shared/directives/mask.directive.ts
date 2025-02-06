/**
 * @fileoverview Angular directive for input masking with healthcare-specific format support
 * Provides enhanced input formatting for CPF, phone numbers, dates, and health record identifiers
 * @version 1.0.0
 */

import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { validateCPF } from '../utils/validation.utils';
import { REGEX_PATTERNS } from '../../core/constants/validation.constants';

@Directive({
  selector: '[appMask]'
})
export class MaskDirective {
  @Input() maskPattern: string = '';
  private previousValue: string = '';
  private cursorPosition: number = 0;
  private isBackspace: boolean = false;

  // Mask pattern definitions for healthcare-specific formats
  private readonly MASK_PATTERNS = {
    CPF: '000.000.000-00',
    PHONE: '+00 (00) 00000-0000',
    DATE: '0000-00-00',
    HEALTH_ID: 'AA-0000000000',
    MEDICAL_CODE: '000.000.000-0'
  };

  // Pattern placeholder characters
  private readonly PATTERN_CHARS = {
    '0': /\d/,  // Digits only
    'A': /[A-Za-z]/,  // Letters only
    '*': /[A-Za-z0-9]/  // Alphanumeric
  };

  constructor(private el: ElementRef) {}

  /**
   * Handles input events with cursor position management
   * @param event Input event
   */
  @HostListener('input', ['$event'])
  onInput(event: InputEvent): void {
    const input = event.target as HTMLInputElement;
    this.cursorPosition = input.selectionStart || 0;
    this.isBackspace = event.inputType === 'deleteContentBackward';

    let value = input.value;
    const pattern = this.maskPattern || this.detectPattern(value);

    if (pattern) {
      // Remove non-pattern characters
      value = this.cleanValue(value);
      
      // Apply mask
      const maskedValue = this.applyMask(value, pattern);
      
      // Update input value if changed
      if (maskedValue !== input.value) {
        input.value = maskedValue;
        
        // Adjust cursor position
        this.adjustCursorPosition(input, maskedValue);
      }

      this.previousValue = maskedValue;
    }
  }

  /**
   * Detects appropriate mask pattern based on input format
   * @param value Input value
   * @returns Detected mask pattern
   */
  private detectPattern(value: string): string {
    if (new RegExp(REGEX_PATTERNS.CPF).test(value)) {
      return this.MASK_PATTERNS.CPF;
    }
    if (new RegExp(REGEX_PATTERNS.PHONE).test(value)) {
      return this.MASK_PATTERNS.PHONE;
    }
    if (new RegExp(REGEX_PATTERNS.DATE).test(value)) {
      return this.MASK_PATTERNS.DATE;
    }
    return '';
  }

  /**
   * Removes non-pattern characters from input
   * @param value Input value
   * @returns Cleaned value
   */
  private cleanValue(value: string): string {
    return value.replace(/[^\dA-Za-z]/g, '');
  }

  /**
   * Applies mask pattern to input value
   * @param value Clean input value
   * @param pattern Mask pattern to apply
   * @returns Masked value
   */
  private applyMask(value: string, pattern: string): string {
    let maskedValue = '';
    let valueIndex = 0;

    // Handle special case for CPF validation
    if (pattern === this.MASK_PATTERNS.CPF && !validateCPF(value)) {
      return value;
    }

    for (let i = 0; i < pattern.length && valueIndex < value.length; i++) {
      const patternChar = pattern[i];
      const valueChar = value[valueIndex];

      if (this.PATTERN_CHARS[patternChar]) {
        // Check if value matches pattern character
        if (this.PATTERN_CHARS[patternChar].test(valueChar)) {
          maskedValue += valueChar;
          valueIndex++;
        }
      } else {
        // Add mask character
        maskedValue += patternChar;
        
        // Only increment value index if the current value character matches the mask character
        if (valueChar === patternChar) {
          valueIndex++;
        }
      }
    }

    return maskedValue;
  }

  /**
   * Adjusts cursor position after mask application
   * @param input Input element
   * @param maskedValue New masked value
   */
  private adjustCursorPosition(input: HTMLInputElement, maskedValue: string): void {
    let cursorPos = this.cursorPosition;

    // Adjust for backspace
    if (this.isBackspace) {
      while (
        cursorPos > 0 &&
        maskedValue[cursorPos - 1] &&
        !this.PATTERN_CHARS[maskedValue[cursorPos - 1]]
      ) {
        cursorPos--;
      }
    } else {
      // Adjust for typing
      while (
        cursorPos < maskedValue.length &&
        maskedValue[cursorPos] &&
        !this.PATTERN_CHARS[maskedValue[cursorPos]]
      ) {
        cursorPos++;
      }
    }

    // Set adjusted cursor position
    input.setSelectionRange(cursorPos, cursorPos);
  }

  /**
   * Validates the final masked value
   * @param value Masked value
   * @returns Validation result
   */
  private validateFormat(value: string): boolean {
    if (!value) return true;

    const pattern = this.maskPattern || this.detectPattern(value);
    
    switch (pattern) {
      case this.MASK_PATTERNS.CPF:
        return new RegExp(REGEX_PATTERNS.CPF).test(value);
      case this.MASK_PATTERNS.PHONE:
        return new RegExp(REGEX_PATTERNS.PHONE).test(value);
      case this.MASK_PATTERNS.DATE:
        return new RegExp(REGEX_PATTERNS.DATE).test(value);
      default:
        return true;
    }
  }
}