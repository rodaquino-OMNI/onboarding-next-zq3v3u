/**
 * @fileoverview Angular service providing secure storage operations for sensitive healthcare enrollment data
 * Implements AES-256-GCM encryption, session management, and type-safe data handling
 * @version 1.0.0
 */

import { Injectable } from '@angular/core'; // ^15.0.0
import { Observable, BehaviorSubject, from } from 'rxjs'; // ^7.5.0
import { APP_CONFIG } from '../constants/app.constants';
import { StorageUtils } from '../../shared/utils/storage.utils';

/**
 * Storage event interface for cross-tab synchronization
 */
interface StorageEvent {
  key: string;
  action: 'set' | 'remove' | 'clear';
  timestamp: number;
}

/**
 * Storage options interface
 */
interface StorageOptions {
  expiry?: number;
  secure?: boolean;
  debug?: boolean;
}

/**
 * Type validation helper
 */
type Type<T> = new (...args: any[]) => T;

/**
 * @class StorageService
 * @description Injectable service providing secure storage operations with encryption,
 * session management, and type-safe data handling for healthcare enrollment data
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly storagePrefix: string = 'AUSTA_';
  private readonly sessionTimeout: number = APP_CONFIG.SESSION_TIMEOUT;
  private storageSubject: BehaviorSubject<StorageEvent> = new BehaviorSubject<StorageEvent>(null);

  constructor() {
    // Initialize storage event listener for cross-tab synchronization
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key?.startsWith(this.storagePrefix)) {
        this.storageSubject.next({
          key: event.key.replace(this.storagePrefix, ''),
          action: event.newValue ? 'set' : 'remove',
          timestamp: Date.now()
        });
      }
    });

    // Start session cleanup interval
    setInterval(() => this.cleanupExpiredItems(), this.sessionTimeout * 1000);
  }

  /**
   * Securely stores sensitive data with AES-256-GCM encryption
   * @param key Storage key
   * @param value Value to store
   * @param options Storage options
   * @returns Observable that completes when storage operation is done
   */
  public setSecureItem<T>(key: string, value: T, options: StorageOptions = {}): Observable<void> {
    return from(new Promise<void>((resolve, reject) => {
      try {
        StorageUtils.setStorageItem(
          key,
          value,
          true,
          {
            expiry: options.expiry || this.sessionTimeout,
            debug: options.debug
          }
        );
        
        this.storageSubject.next({
          key,
          action: 'set',
          timestamp: Date.now()
        });
        
        resolve();
      } catch (error) {
        reject(new Error(`Secure storage operation failed: ${error.message}`));
      }
    }));
  }

  /**
   * Retrieves and decrypts sensitive data with type validation
   * @param key Storage key
   * @param type Expected return type
   * @returns Observable of decrypted value or null if not found/expired
   */
  public getSecureItem<T>(key: string, type: Type<T>): Observable<T | null> {
    return from(new Promise<T | null>((resolve, reject) => {
      try {
        const value = StorageUtils.getStorageItem(key, true);
        
        if (value === null) {
          resolve(null);
          return;
        }

        // Validate type
        if (!(value instanceof type) && typeof value !== typeof type()) {
          throw new Error(`Type mismatch: Expected ${type.name}`);
        }

        resolve(value as T);
      } catch (error) {
        reject(new Error(`Secure retrieval failed: ${error.message}`));
      }
    }));
  }

  /**
   * Stores non-sensitive data with type safety
   * @param key Storage key
   * @param value Value to store
   * @param options Storage options
   * @returns Observable that completes when storage operation is done
   */
  public setItem<T>(key: string, value: T, options: StorageOptions = {}): Observable<void> {
    return from(new Promise<void>((resolve, reject) => {
      try {
        StorageUtils.setStorageItem(
          key,
          value,
          false,
          {
            expiry: options.expiry || this.sessionTimeout,
            debug: options.debug
          }
        );

        this.storageSubject.next({
          key,
          action: 'set',
          timestamp: Date.now()
        });

        resolve();
      } catch (error) {
        reject(new Error(`Storage operation failed: ${error.message}`));
      }
    }));
  }

  /**
   * Retrieves non-sensitive data with type validation
   * @param key Storage key
   * @param type Expected return type
   * @returns Observable of value or null if not found/expired
   */
  public getItem<T>(key: string, type: Type<T>): Observable<T | null> {
    return from(new Promise<T | null>((resolve, reject) => {
      try {
        const value = StorageUtils.getStorageItem(key, false);
        
        if (value === null) {
          resolve(null);
          return;
        }

        // Validate type
        if (!(value instanceof type) && typeof value !== typeof type()) {
          throw new Error(`Type mismatch: Expected ${type.name}`);
        }

        resolve(value as T);
      } catch (error) {
        reject(new Error(`Retrieval failed: ${error.message}`));
      }
    }));
  }

  /**
   * Removes an item from storage with event notification
   * @param key Storage key
   * @returns Observable that completes when removal is done
   */
  public removeItem(key: string): Observable<void> {
    return from(new Promise<void>((resolve, reject) => {
      try {
        StorageUtils.removeStorageItem(key);
        
        this.storageSubject.next({
          key,
          action: 'remove',
          timestamp: Date.now()
        });

        resolve();
      } catch (error) {
        reject(new Error(`Remove operation failed: ${error.message}`));
      }
    }));
  }

  /**
   * Clears all AUSTA-related items from storage
   * @returns Observable that completes when clear is done
   */
  public clear(): Observable<void> {
    return from(new Promise<void>((resolve, reject) => {
      try {
        StorageUtils.clearStorage();
        
        this.storageSubject.next({
          key: null,
          action: 'clear',
          timestamp: Date.now()
        });

        resolve();
      } catch (error) {
        reject(new Error(`Clear operation failed: ${error.message}`));
      }
    }));
  }

  /**
   * Cleans up expired items from storage
   * @private
   */
  private cleanupExpiredItems(): void {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    keys.forEach(key => {
      if (key.startsWith(this.storagePrefix)) {
        try {
          StorageUtils.getStorageItem(
            key.replace(this.storagePrefix, ''),
            false
          );
        } catch (error) {
          // Item was automatically removed if expired
          console.debug(`Cleaned up expired item: ${key}`);
        }
      }
    });
  }
}