import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Components
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { UserManagementComponent } from './components/user-management/user-management.component';

// Guards
import { RoleGuard } from '../../core/guards/role.guard';

// Constants
import { UserRole } from '../../core/interfaces/user.interface';

/**
 * Enhanced routing configuration for administrative section
 * Implements role-based access control with circuit breaker pattern
 * and comprehensive audit logging
 */
const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'Admin Dashboard',
      securityLevel: 'high',
      auditLog: true,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 300000 // 5 minutes
      }
    }
  },
  {
    path: 'users',
    component: UserManagementComponent,
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'User Management',
      securityLevel: 'high',
      auditLog: true,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 300000 // 5 minutes
      }
    }
  },
  {
    path: 'enrollments',
    loadChildren: () => import('./modules/enrollment-management/enrollment-management.module')
      .then(m => m.EnrollmentManagementModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'Enrollment Management',
      securityLevel: 'high',
      auditLog: true,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 300000
      }
    }
  },
  {
    path: 'documents',
    loadChildren: () => import('./modules/document-management/document-management.module')
      .then(m => m.DocumentManagementModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'Document Management',
      securityLevel: 'high',
      auditLog: true,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 300000
      }
    }
  },
  {
    path: 'interviews',
    loadChildren: () => import('./modules/interview-management/interview-management.module')
      .then(m => m.InterviewManagementModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'Interview Management',
      securityLevel: 'high',
      auditLog: true,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 300000
      }
    }
  },
  {
    path: 'settings',
    loadChildren: () => import('./modules/admin-settings/admin-settings.module')
      .then(m => m.AdminSettingsModule),
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'System Settings',
      securityLevel: 'high',
      auditLog: true,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 300000
      }
    }
  },
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];

/**
 * Administrative routing module with enhanced security features
 * Implements HIPAA-compliant access control and audit logging
 */
@NgModule({
  imports: [
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule],
  providers: [RoleGuard]
})
export class AdminRoutingModule { }