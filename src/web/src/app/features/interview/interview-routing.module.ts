/**
 * @fileoverview Interview routing module implementing secure role-based access control
 * for video-based medical interviews in the healthcare enrollment platform.
 * @version 1.0.0
 */

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { InterviewRoomComponent } from './pages/interview-room/interview-room.component';
import { RoleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/interfaces/user.interface';

/**
 * Interview feature routes with role-based access control
 * Implements secure routing for video interview functionality
 */
const interviewRoutes: Routes = [
  {
    path: ':id',
    component: InterviewRoomComponent,
    canActivate: [RoleGuard],
    data: {
      role: UserRole.Interviewer,
      roles: [UserRole.Interviewer, UserRole.Individual],
      reuse: true, // Enable route reuse for performance optimization
      title: 'Medical Interview',
      breadcrumb: 'Interview Room'
    }
  }
];

/**
 * Interview routing module providing secure route configuration
 * for the video interview feature of the healthcare enrollment platform.
 */
@NgModule({
  imports: [
    RouterModule.forChild(interviewRoutes)
  ],
  exports: [
    RouterModule
  ]
})
export class InterviewRoutingModule {
  /**
   * Initializes the routing module with secured interview routes
   * and role-based access control.
   */
  constructor() {
    // Route configuration is handled through the Routes array
    // Additional runtime configuration can be added here if needed
  }
}