<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Authentication Language Lines
    |--------------------------------------------------------------------------
    |
    | The following language lines are used during authentication for various
    | messages that we need to display to the user. You are free to modify
    | these language lines according to your application's requirements.
    |
    | HIPAA Compliance Notice: These messages are designed to maintain privacy
    | and security standards for protected health information (PHI).
    |
    */

    // Standard Authentication Messages
    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many login attempts. Please try again in :seconds seconds.',

    // Success Messages
    'login_success' => 'You have successfully logged into your secure healthcare account.',
    'logout_success' => 'You have been securely logged out of your healthcare account.',
    'registration_success' => 'Your healthcare account has been successfully created.',

    // Token and Session Messages
    'token_invalid' => 'Your session token is invalid. Please log in again.',
    'token_expired' => 'Your session has expired. Please log in again to continue.',
    'session_timeout' => 'Your session has timed out due to inactivity. Please log in again.',

    // Authorization Messages
    'unauthorized' => 'You are not authorized to access this healthcare resource.',
    'mfa_required' => 'For your security, please complete the two-factor authentication process.',

    // Security and Compliance Messages
    'hipaa_warning' => 'This system contains protected health information. Unauthorized access is prohibited.',

    // Additional Healthcare-Specific Messages
    'account_locked' => 'Your account has been locked for security purposes. Please contact support.',
    'password_expired' => 'Your password has expired. Please update it to maintain account security.',
    'secure_connection_required' => 'A secure connection is required to access healthcare information.',
    'privacy_notice' => 'By accessing this system, you agree to maintain the confidentiality of all health information.',
    'audit_notice' => 'All system access and activities are monitored and logged for compliance purposes.',
    
    // Multi-Factor Authentication Messages
    'mfa_code_sent' => 'A security code has been sent to your verified contact method.',
    'mfa_code_invalid' => 'The security code entered is invalid. Please try again.',
    'mfa_setup_required' => 'Two-factor authentication setup is required for accessing healthcare data.',
    
    // Session Management
    'concurrent_session' => 'Another session has been detected. For security, only one active session is allowed.',
    'session_expired' => 'Your session has expired for security purposes. Please authenticate again.',
    
    // Access Control
    'role_required' => 'Your current role does not have permission to access this healthcare resource.',
    'device_unauthorized' => 'This device is not authorized to access healthcare information.',
    'location_restricted' => 'Access from your current location is restricted.',
    
    // System Status
    'system_maintenance' => 'System is undergoing maintenance to ensure secure healthcare data processing.',
    'security_update_required' => 'A security update is required before accessing the system.',
];