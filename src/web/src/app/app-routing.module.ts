import { NgModule } from '@angular/core';
import { RouterModule, Routes, PreloadAllModules, UrlSerializer, URIError } from '@angular/router';
import { AuthGuard } from './core/auth/auth.guard';
import { RoleGuard } from './core/guards/role.guard';
import { UserRole } from './core/interfaces/user.interface';

/**
 * Main application routes with role-based access control and lazy loading
 * Version: 1.0.0
 */
const routes: Routes = [
  // Default redirect
  {
    path: '',
    redirectTo: 'enrollment',
    pathMatch: 'full'
  },

  // Authentication routes
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule),
    data: {
      title: 'Authentication',
      preload: true
    }
  },

  // Enrollment routes - accessible by individuals, brokers, and admins
  {
    path: 'enrollment',
    loadChildren: () => import('./features/enrollment/enrollment.module').then(m => m.EnrollmentModule),
    canActivate: [AuthGuard],
    data: {
      roles: [UserRole.Individual, UserRole.Broker, UserRole.Admin],
      title: 'Digital Enrollment',
      requireMfa: false
    }
  },

  // Document management routes
  {
    path: 'documents',
    loadChildren: () => import('./features/documents/documents.module').then(m => m.DocumentsModule),
    canActivate: [AuthGuard],
    data: {
      roles: [UserRole.Individual, UserRole.Broker, UserRole.Admin],
      title: 'Document Management',
      requireMfa: false
    }
  },

  // Medical interview routes
  {
    path: 'interview',
    loadChildren: () => import('./features/interview/interview.module').then(m => m.InterviewModule),
    canActivate: [AuthGuard, RoleGuard],
    data: {
      roles: [UserRole.Interviewer, UserRole.Individual],
      title: 'Medical Interview',
      requireMfa: true
    }
  },

  // Admin routes - requires admin role and MFA
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.module').then(m => m.AdminModule),
    canActivate: [AuthGuard, RoleGuard],
    data: {
      role: UserRole.Admin,
      title: 'Administration',
      requireMfa: true
    }
  },

  // Broker dashboard routes
  {
    path: 'broker',
    loadChildren: () => import('./features/broker/broker.module').then(m => m.BrokerModule),
    canActivate: [AuthGuard, RoleGuard],
    data: {
      role: UserRole.Broker,
      title: 'Broker Dashboard',
      requireMfa: false
    }
  },

  // Health records routes
  {
    path: 'health-records',
    loadChildren: () => import('./features/health-records/health-records.module').then(m => m.HealthRecordsModule),
    canActivate: [AuthGuard],
    data: {
      roles: [UserRole.Individual, UserRole.Admin],
      title: 'Health Records',
      requireMfa: true
    }
  },

  // Error routes
  {
    path: 'error',
    loadChildren: () => import('./features/error/error.module').then(m => m.ErrorModule),
    data: {
      title: 'Error'
    }
  },

  // Catch-all route for 404
  {
    path: '**',
    redirectTo: 'error/404'
  }
];

/**
 * Root routing module implementing secure route configuration with role-based access control
 * and optimized lazy loading for the healthcare enrollment platform.
 */
@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      preloadingStrategy: PreloadAllModules,
      scrollPositionRestoration: 'enabled',
      paramsInheritanceStrategy: 'always',
      relativeLinkResolution: 'corrected',
      malformedUriErrorHandler: (error: URIError, urlSerializer: UrlSerializer, url: string) => 
        urlSerializer.parse('/error/404'),
      initialNavigation: 'enabledBlocking'
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}