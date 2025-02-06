import { Injectable } from '@angular/core';
import { 
  CanActivate, 
  CanActivateChild, 
  CanLoad,
  ActivatedRouteSnapshot, 
  RouterStateSnapshot, 
  Route,
  Router
} from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from './auth.service';

/**
 * Route guard implementing JWT-based authentication validation and zero trust security model
 * for protecting routes, child routes, and lazy-loaded modules.
 * Version: 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate, CanActivateChild, CanLoad {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  /**
   * Guards route activation by validating current authentication state
   * Implements zero trust model by validating JWT on every route access
   * 
   * @param route Current route being accessed
   * @param state Current router state
   * @returns Observable<boolean> indicating if access is allowed
   */
  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.authService.isAuthenticated$.pipe(
      map(isAuthenticated => {
        if (isAuthenticated) {
          return true;
        }

        // Store attempted URL for redirect after login
        const returnUrl = state.url;
        this.router.navigate(['/login'], {
          queryParams: { returnUrl },
          replaceUrl: true
        });
        return false;
      })
    );
  }

  /**
   * Guards child route activation using same authentication validation
   * Maintains zero trust model across nested routes
   * 
   * @param childRoute Child route being accessed
   * @param state Current router state
   * @returns Observable<boolean> indicating if access is allowed
   */
  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.canActivate(childRoute, state);
  }

  /**
   * Guards lazy-loaded module loading based on authentication state
   * Prevents unauthorized module loading as part of zero trust implementation
   * 
   * @param route Route being loaded
   * @returns Observable<boolean> indicating if module loading is allowed
   */
  canLoad(route: Route): Observable<boolean> {
    return this.authService.isAuthenticated$.pipe(
      map(isAuthenticated => {
        if (isAuthenticated) {
          return true;
        }

        this.router.navigate(['/login'], {
          queryParams: { returnUrl: route.path },
          replaceUrl: true
        });
        return false;
      })
    );
  }
}