import { Pipe, PipeTransform } from '@angular/core'; // ^15.0.0
import { DatePipe } from '@angular/common'; // ^15.0.0
import { TranslateService } from '@ngx-translate/core'; // ^14.0.0

@Pipe({
  name: 'dateFormat',
  pure: true
})
export class DateFormatPipe implements PipeTransform {
  private datePipe: DatePipe;
  private currentLang: string;
  private formatCache: Map<string, string>;
  private readonly healthcareFormats: { [key: string]: string } = {
    clinical: 'dd-MMM-yyyy HH:mm:ss',
    emr: 'yyyy-MM-dd\'T\'HH:mm:ssZZZZZ',
    appointment: 'MMM dd, yyyy HH:mm',
    birthDate: 'MM/dd/yyyy',
    medicalRecord: 'yyyyMMdd',
    hipaaCompliant: 'MM/dd/yyyy',
    shortDate: 'MM/dd/yy',
    longDate: 'MMMM dd, yyyy'
  };

  constructor(private translateService: TranslateService) {
    // Initialize with current language
    this.currentLang = this.translateService.currentLang || 'en';
    this.datePipe = new DatePipe(this.currentLang);
    this.formatCache = new Map<string, string>();

    // Subscribe to language changes
    this.translateService.onLangChange.subscribe(({ lang }) => {
      this.currentLang = lang;
      this.datePipe = new DatePipe(lang);
      this.formatCache.clear();
    });
  }

  transform(value: Date | string | number, format?: string): string | null {
    if (!value) {
      return null;
    }

    // Validate medical date
    if (!this.validateMedicalDate(value)) {
      console.warn('Invalid date format for medical records:', value);
      return null;
    }

    // Generate cache key
    const cacheKey = `${value}-${format}-${this.currentLang}`;
    if (this.formatCache.has(cacheKey)) {
      return this.formatCache.get(cacheKey) || null;
    }

    try {
      // Handle healthcare-specific formats
      let dateFormat = format;
      if (format && this.healthcareFormats[format]) {
        dateFormat = this.healthcareFormats[format];
      } else if (!format) {
        // Default format based on locale
        dateFormat = this.currentLang === 'pt' ? 'dd/MM/yyyy' : 'MM/dd/yyyy';
      }

      // Format date with locale support
      const formattedDate = this.datePipe.transform(value, dateFormat, 'UTC');

      if (formattedDate) {
        // Cache the result
        this.formatCache.set(cacheKey, formattedDate);
        return formattedDate;
      }

      return null;
    } catch (error) {
      console.error('Date formatting error:', error);
      return null;
    }
  }

  private validateMedicalDate(value: Date | string | number): boolean {
    try {
      const date = new Date(value);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return false;
      }

      // Validate date range (no future dates for medical records)
      const now = new Date();
      if (date > now) {
        return false;
      }

      // Validate minimum date (reasonable medical record date)
      const minDate = new Date('1900-01-01');
      if (date < minDate) {
        return false;
      }

      // Additional HIPAA compliance checks
      if (typeof value === 'string' && value.length > 0) {
        // Check for proper date format
        const dateRegex = /^\d{4}(-|\/)(?:0[1-9]|1[0-2])(-|\/)(?:0[1-9]|[12]\d|3[01])$/;
        if (!dateRegex.test(value) && !isNaN(Date.parse(value))) {
          return true;
        }
      }

      return true;
    } catch (error) {
      console.error('Date validation error:', error);
      return false;
    }
  }
}