import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Component imports
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';

/**
 * Authentication routes configuration with security and compliance metadata
 * Version: 1.0.0
 */
const authRoutes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: LoginComponent,
    data: {
      title: 'Login',
      requiresAuth: false,
      compliance: ['HIPAA', 'GDPR', 'LGPD'],
      rateLimit: {
        maxAttempts: 5,
        windowMs: 900000 // 15 minutes
      }
    }
  },
  {
    path: 'register',
    component: RegisterComponent,
    data: {
      title: 'Register',
      requiresAuth: false,
      compliance: ['HIPAA', 'GDPR', 'LGPD'],
      validation: {
        enabled: true,
        rules: ['password', 'email', 'cpf']
      }
    }
  },
  {
    path: 'password',
    loadChildren: () => import('./pages/password/password.module')
      .then(m => m.PasswordModule),
    data: {
      title: 'Password Management',
      requiresAuth: true,
      compliance: ['HIPAA', 'GDPR', 'LGPD'],
      security: {
        requireMfa: true,
        sessionTimeout: 900 // 15 minutes
      }
    }
  },
  {
    path: 'mfa',
    loadChildren: () => import('./pages/mfa/mfa.module')
      .then(m => m.MfaModule),
    data: {
      title: 'Multi-Factor Authentication',
      requiresAuth: true,
      compliance: ['HIPAA', 'GDPR', 'LGPD'],
      security: {
        enforceHttps: true,
        preventConcurrentSessions: true
      }
    }
  },
  {
    path: 'verify-email',
    loadChildren: () => import('./pages/verify-email/verify-email.module')
      .then(m => m.VerifyEmailModule),
    data: {
      title: 'Email Verification',
      requiresAuth: false,
      compliance: ['HIPAA', 'GDPR', 'LGPD'],
      rateLimit: {
        maxAttempts: 3,
        windowMs: 3600000 // 1 hour
      }
    }
  }
];

/**
 * Authentication routing module that configures secure routes with compliance metadata
 * Implements role-based access control and security features
 */
@NgModule({
  imports: [
    RouterModule.forChild(authRoutes)
  ],
  exports: [
    RouterModule
  ]
})
export class AuthRoutingModule { }