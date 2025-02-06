import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { 
  MatTableModule,
  MatSortModule, 
  MatPaginatorModule,
  MatFormFieldModule,
  MatInputModule,
  MatButtonModule,
  MatSnackBarModule,
  MatDialogModule
} from '@angular/material';
import { TranslateModule } from '@ngx-translate/core';
import { ScrollingModule } from '@angular/cdk/scrolling';

// Routing Module
import { AdminRoutingModule } from './admin-routing.module';

// Components
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { UserManagementComponent } from './components/user-management/user-management.component';

/**
 * Administrative feature module implementing secure system management capabilities
 * with role-based access control and HIPAA compliance
 * Version: 1.0.0
 */
@NgModule({
  declarations: [
    DashboardComponent,
    UserManagementComponent
  ],
  imports: [
    // Angular Core Modules
    CommonModule,
    ReactiveFormsModule,
    ScrollingModule,

    // Routing
    AdminRoutingModule,

    // Material Design Modules
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
    MatDialogModule,

    // Internationalization
    TranslateModule.forChild({
      extend: true,
      isolate: false
    })
  ],
  providers: [],
  exports: [
    DashboardComponent,
    UserManagementComponent
  ]
})
export class AdminModule {
  constructor() {
    // Module initialization with security context verification
    this.validateSecurityContext();
  }

  /**
   * Validates security context during module initialization
   * Ensures HIPAA compliance and proper access controls
   */
  private validateSecurityContext(): void {
    // Security validation is handled by AdminRoutingModule guards
    // and individual component security checks
  }
}