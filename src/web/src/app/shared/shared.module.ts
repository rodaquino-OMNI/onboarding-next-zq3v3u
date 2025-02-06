import { NgModule } from '@angular/core'; // @angular/core ^15.0.0
import { CommonModule } from '@angular/common'; // @angular/common ^15.0.0
import { FormsModule, ReactiveFormsModule } from '@angular/forms'; // @angular/forms ^15.0.0
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; // @angular/material/progress-spinner ^15.0.0
import { TranslateModule } from '@ngx-translate/core'; // @ngx-translate/core ^14.0.0

// Internal component imports
import { AlertComponent } from './components/alert/alert.component';
import { LoadingComponent } from './components/loading/loading.component';
import { MaskDirective } from './directives/mask.directive';

/**
 * SharedModule centralizes common functionality for the AUSTA Integration Platform
 * Implements design system specifications, accessibility features, and healthcare-specific validations
 * @version 1.0.0
 */
@NgModule({
  declarations: [
    // Components
    AlertComponent,
    LoadingComponent,
    
    // Directives
    MaskDirective
  ],
  imports: [
    // Angular modules
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    
    // Material Design modules
    MatProgressSpinnerModule,
    
    // Translation module with lazy loading support
    TranslateModule.forChild()
  ],
  exports: [
    // Re-export Angular modules
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    
    // Export components
    AlertComponent,
    LoadingComponent,
    
    // Export directives
    MaskDirective,
    
    // Export translation module
    TranslateModule
  ]
})
export class SharedModule {
  /**
   * Provides root configuration for shared module with healthcare-specific providers
   * @returns ModuleWithProviders<SharedModule>
   */
  static forRoot() {
    return {
      ngModule: SharedModule,
      providers: [
        // Add any shared providers here if needed
      ]
    };
  }
}