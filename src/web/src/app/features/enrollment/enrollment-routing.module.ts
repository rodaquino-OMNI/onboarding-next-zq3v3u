import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules } from '@angular/router';

import { EnrollmentFormComponent } from './pages/enrollment-form/enrollment-form.component';
import { RoleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/interfaces/user.interface';

/**
 * Enhanced route configuration with security, audit, and compliance features
 * Version: 1.0.0
 */
const routes: Routes = [
  {
    path: '',
    redirectTo: 'form',
    pathMatch: 'full'
  },
  {
    path: 'form',
    component: EnrollmentFormComponent,
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Individual,
      title: 'Digital Enrollment Form',
      requiresAuth: true,
      hipaaCompliant: true,
      auditLevel: 'detailed',
      cacheStrategy: 'no-store',
      securityHeaders: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    },
    resolve: {
      // Add resolvers if needed for data prefetching
    }
  },
  {
    path: ':id/edit',
    component: EnrollmentFormComponent,
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Individual,
      title: 'Edit Enrollment',
      requiresAuth: true,
      hipaaCompliant: true,
      auditLevel: 'detailed',
      cacheStrategy: 'no-store',
      securityHeaders: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    }
  },
  {
    path: 'broker',
    loadChildren: () => import('./pages/broker/broker.module')
      .then(m => m.BrokerModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Broker,
      title: 'Broker Enrollments',
      requiresAuth: true,
      hipaaCompliant: true,
      auditLevel: 'detailed'
    }
  },
  {
    path: 'admin',
    loadChildren: () => import('./pages/admin/admin.module')
      .then(m => m.AdminModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'Enrollment Administration',
      requiresAuth: true,
      hipaaCompliant: true,
      auditLevel: 'detailed'
    }
  },
  {
    path: 'interviewer',
    loadChildren: () => import('./pages/interviewer/interviewer.module')
      .then(m => m.InterviewerModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Interviewer,
      title: 'Interview Management',
      requiresAuth: true,
      hipaaCompliant: true,
      auditLevel: 'detailed'
    }
  },
  {
    path: '**',
    redirectTo: 'form'
  }
];

/**
 * Enhanced routing module with security and compliance features
 * Implements HIPAA-compliant route handling and audit logging
 */
@NgModule({
  imports: [
    RouterModule.forChild(routes)
  ],
  exports: [
    RouterModule
  ]
})
export class EnrollmentRoutingModule {
  constructor() {
    // Module initialization can be added here if needed
  }
}

// Export routes for testing and documentation
export { routes };