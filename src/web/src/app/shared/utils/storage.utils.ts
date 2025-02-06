/**
 * @fileoverview Secure browser storage utilities for AUSTA Integration Platform
 * Implements AES-256-GCM encryption with secure IV handling for sensitive data
 * @version 1.0.0
 */

import { APP_CONFIG } from '../../core/constants/app.constants';
import CryptoJS from 'crypto-js'; // v4.1.1

// Storage configuration constants
const STORAGE_PREFIX = 'AUSTA_';
const ENCRYPTION_KEY = process.env.STORAGE_ENCRYPTION_KEY;
const IV_LENGTH = 16;
const STORAGE_VERSION = '1.0';

// Storage options interface
interface StorageOptions {
  expiry?: number;
  debug?: boolean;
}

// Storage metadata interface
interface StorageMetadata {
  version: string;
  timestamp: number;
  encrypted: boolean;
}

/**
 * Encrypts data using AES-256-GCM with secure IV generation
 * @param data - Data to encrypt
 * @returns Base64 encoded string containing IV and encrypted data
 * @throws Error if encryption fails
 */
export function encryptData(data: any): string {
  try {
    // Generate cryptographically secure random IV
    const iv = CryptoJS.lib.WordArray.random(IV_LENGTH);
    
    // Convert data to string if object
    const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    // Create key from environment variable
    const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
    
    // Encrypt using AES-GCM
    const encrypted = CryptoJS.AES.encrypt(dataString, key, {
      iv: iv,
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.Pkcs7
    });
    
    // Combine IV and ciphertext
    const combined = CryptoJS.lib.WordArray.create()
      .concat(iv)
      .concat(encrypted.ciphertext);
      
    return CryptoJS.enc.Base64.stringify(combined);
  } catch (error) {
    throw new Error('Encryption failed: ' + error.message);
  }
}

/**
 * Decrypts AES-256-GCM encrypted data
 * @param encryptedData - Base64 encoded encrypted data with IV
 * @returns Decrypted data in original format
 * @throws Error if decryption fails
 */
export function decryptData(encryptedData: string): any {
  try {
    // Decode Base64
    const combined = CryptoJS.enc.Base64.parse(encryptedData);
    
    // Extract IV and ciphertext
    const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, IV_LENGTH / 4));
    const ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(IV_LENGTH / 4));
    
    // Create key from environment variable
    const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
    
    // Decrypt using AES-GCM
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      key,
      { iv: iv, mode: CryptoJS.mode.GCM, padding: CryptoJS.pad.Pkcs7 }
    );
    
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    // Try parsing as JSON, return as is if not JSON
    try {
      return JSON.parse(decryptedString);
    } catch {
      return decryptedString;
    }
  } catch (error) {
    throw new Error('Decryption failed: ' + error.message);
  }
}

/**
 * Stores data in browser storage with optional encryption
 * @param key - Storage key
 * @param value - Value to store
 * @param encrypt - Whether to encrypt the data
 * @param options - Storage options
 */
export function setStorageItem(
  key: string,
  value: any,
  encrypt: boolean = false,
  options: StorageOptions = {}
): void {
  try {
    if (!key) throw new Error('Storage key is required');
    
    const prefixedKey = STORAGE_PREFIX + key;
    const timestamp = Date.now();
    
    // Create metadata
    const metadata: StorageMetadata = {
      version: STORAGE_VERSION,
      timestamp,
      encrypted: encrypt
    };
    
    // Process value
    let processedValue = value;
    if (encrypt) {
      processedValue = encryptData(value);
    }
    
    // Store value and metadata
    localStorage.setItem(prefixedKey, JSON.stringify(processedValue));
    localStorage.setItem(`${prefixedKey}_meta`, JSON.stringify(metadata));
    
    if (options.debug) {
      console.debug(`Storage: Set ${key}`, { encrypted: encrypt });
    }
  } catch (error) {
    throw new Error(`Failed to set storage item: ${error.message}`);
  }
}

/**
 * Retrieves data from browser storage with optional decryption
 * @param key - Storage key
 * @param decrypt - Whether to decrypt the data
 * @param options - Storage options
 * @returns Retrieved value or null if not found/expired
 */
export function getStorageItem(
  key: string,
  decrypt: boolean = false,
  options: StorageOptions = {}
): any | null {
  try {
    if (!key) throw new Error('Storage key is required');
    
    const prefixedKey = STORAGE_PREFIX + key;
    
    // Get metadata
    const metadataStr = localStorage.getItem(`${prefixedKey}_meta`);
    if (!metadataStr) return null;
    
    const metadata: StorageMetadata = JSON.parse(metadataStr);
    
    // Check version
    if (metadata.version !== STORAGE_VERSION) {
      removeStorageItem(key);
      return null;
    }
    
    // Check session timeout
    const elapsed = Date.now() - metadata.timestamp;
    if (elapsed > APP_CONFIG.SESSION_TIMEOUT * 1000) {
      removeStorageItem(key);
      return null;
    }
    
    // Get and process value
    const valueStr = localStorage.getItem(prefixedKey);
    if (!valueStr) return null;
    
    let value = JSON.parse(valueStr);
    
    if (metadata.encrypted && decrypt) {
      value = decryptData(value);
    }
    
    if (options.debug) {
      console.debug(`Storage: Get ${key}`, { decrypted: decrypt });
    }
    
    return value;
  } catch (error) {
    throw new Error(`Failed to get storage item: ${error.message}`);
  }
}

/**
 * Removes an item from browser storage
 * @param key - Storage key
 */
export function removeStorageItem(key: string): void {
  try {
    if (!key) throw new Error('Storage key is required');
    
    const prefixedKey = STORAGE_PREFIX + key;
    
    localStorage.removeItem(prefixedKey);
    localStorage.removeItem(`${prefixedKey}_meta`);
  } catch (error) {
    throw new Error(`Failed to remove storage item: ${error.message}`);
  }
}

/**
 * Clears all AUSTA-related items from browser storage
 */
export function clearStorage(): void {
  try {
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    throw new Error(`Failed to clear storage: ${error.message}`);
  }
}