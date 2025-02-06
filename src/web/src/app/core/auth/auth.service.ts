import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, tap, catchError, switchMap, finalize } from 'rxjs/operators';
import * as CryptoJS from 'crypto-js';

import { ApiService } from '../http/api.service';
import { UserService } from '../services/user.service';
import { API_ENDPOINTS } from '../constants/api.constants';
import { AuthenticatedUser } from '../interfaces/user.interface';

interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  tokenExpiry: Date;
  mfaRequired?: boolean;
  mfaToken?: string;
}

interface MFASetupResponse {
  secret: string;
  qrCode: string;
  recoveryKeys: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  private mfaRequiredSubject = new BehaviorSubject<boolean>(false);
  public mfaRequired$ = this.mfaRequiredSubject.asObservable();

  private readonly tokenKey = 'auth_token';
  private readonly refreshTokenKey = 'refresh_token';
  private readonly tokenRefreshThreshold = 300; // 5 minutes in seconds
  private readonly maxRetryAttempts = 3;
  private readonly encryptionKey: string;

  private refreshTokenTimeout: any;

  constructor(
    private apiService: ApiService,
    private userService: UserService,
    private router: Router
  ) {
    // Generate unique encryption key for token storage
    this.encryptionKey = CryptoJS.lib.WordArray.random(32).toString();
    this.checkInitialAuthState();
  }

  /**
   * Authenticates user with credentials and handles MFA flow
   */
  public login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.apiService.post<AuthResponse>(`${API_ENDPOINTS.AUTH}/login`, credentials).pipe(
      tap(response => {
        if (response.mfaRequired) {
          this.mfaRequiredSubject.next(true);
          return;
        }
        this.handleAuthenticationSuccess(response);
      }),
      catchError(error => {
        this.handleAuthenticationError(error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Handles secure logout and cleanup
   */
  public logout(): Observable<void> {
    return this.apiService.post<void>(`${API_ENDPOINTS.AUTH}/logout`, {}).pipe(
      finalize(() => {
        this.clearAuthState();
        this.router.navigate(['/login']);
      })
    );
  }

  /**
   * Initializes MFA setup with QR code generation
   */
  public setupMFA(): Observable<MFASetupResponse> {
    return this.apiService.post<MFASetupResponse>(`${API_ENDPOINTS.AUTH}/mfa/setup`, {}).pipe(
      tap(response => {
        // Store MFA secret securely for verification
        this.securelyStoreValue('mfa_secret', response.secret);
      }),
      catchError(error => {
        console.error('MFA setup failed:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Validates MFA token during authentication
   */
  public verifyMFAToken(token: string): Observable<AuthResponse> {
    const mfaToken = this.securelyRetrieveValue('mfa_token');
    
    return this.apiService.post<AuthResponse>(`${API_ENDPOINTS.AUTH}/mfa/verify`, {
      token,
      mfaToken
    }).pipe(
      tap(response => {
        this.mfaRequiredSubject.next(false);
        this.handleAuthenticationSuccess(response);
      }),
      catchError(error => {
        this.handleAuthenticationError(error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Refreshes authentication token
   */
  private refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.securelyRetrieveValue(this.refreshTokenKey);
    
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    return this.apiService.post<AuthResponse>(`${API_ENDPOINTS.AUTH}/refresh`, {
      refreshToken
    }).pipe(
      tap(response => {
        this.handleAuthenticationSuccess(response);
      }),
      catchError(error => {
        this.handleAuthenticationError(error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Handles successful authentication response
   */
  private handleAuthenticationSuccess(response: AuthResponse): void {
    this.securelyStoreValue(this.tokenKey, response.token);
    this.securelyStoreValue(this.refreshTokenKey, response.refreshToken);
    this.isAuthenticatedSubject.next(true);
    
    // Load user profile after successful authentication
    this.userService.loadUserProfile().subscribe();
    
    // Set up token refresh
    this.scheduleTokenRefresh(response.tokenExpiry);
  }

  /**
   * Handles authentication errors
   */
  private handleAuthenticationError(error: any): void {
    this.clearAuthState();
    console.error('Authentication error:', error);
  }

  /**
   * Schedules token refresh before expiration
   */
  private scheduleTokenRefresh(tokenExpiry: Date): void {
    if (this.refreshTokenTimeout) {
      clearTimeout(this.refreshTokenTimeout);
    }

    const expiresIn = new Date(tokenExpiry).getTime() - Date.now();
    const refreshTime = expiresIn - (this.tokenRefreshThreshold * 1000);

    if (refreshTime > 0) {
      this.refreshTokenTimeout = setTimeout(() => {
        this.refreshToken().subscribe();
      }, refreshTime);
    }
  }

  /**
   * Checks initial authentication state on service initialization
   */
  private checkInitialAuthState(): void {
    const token = this.securelyRetrieveValue(this.tokenKey);
    if (token) {
      this.isAuthenticatedSubject.next(true);
      this.userService.loadUserProfile().subscribe();
    }
  }

  /**
   * Securely stores encrypted values in localStorage
   */
  private securelyStoreValue(key: string, value: string): void {
    const encrypted = CryptoJS.AES.encrypt(value, this.encryptionKey).toString();
    localStorage.setItem(key, encrypted);
  }

  /**
   * Securely retrieves and decrypts values from localStorage
   */
  private securelyRetrieveValue(key: string): string | null {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    try {
      const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Error decrypting value:', error);
      return null;
    }
  }

  /**
   * Clears authentication state and stored tokens
   */
  private clearAuthState(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem('mfa_secret');
    localStorage.removeItem('mfa_token');
    
    this.isAuthenticatedSubject.next(false);
    this.mfaRequiredSubject.next(false);
    
    if (this.refreshTokenTimeout) {
      clearTimeout(this.refreshTokenTimeout);
    }
    
    this.userService.clearCurrentUser();
  }
}