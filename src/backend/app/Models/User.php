<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * User Model for AUSTA Integration Platform
 * 
 * Implements comprehensive user management with role-based access control,
 * multi-language support, and HIPAA/GDPR/LGPD compliance features.
 *
 * @property uuid $id
 * @property string $name
 * @property string $email
 * @property string $password
 * @property string $role
 * @property string $language
 * @property json $preferences
 * @property json $consent_log
 * @property timestamp $email_verified_at
 * @property timestamp $password_changed_at
 * @property timestamp $last_login_at
 * @property string $last_login_ip
 * @property integer $failed_login_attempts
 * @property boolean $is_locked
 * @property timestamp $created_at
 * @property timestamp $updated_at
 * @property timestamp $deleted_at
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, TwoFactorAuthenticatable;

    /**
     * User roles supported by the platform
     */
    public const USER_ROLES = ['individual', 'broker', 'interviewer', 'admin'];

    /**
     * Supported languages for the platform
     */
    public const LANGUAGES = ['en', 'pt-BR'];

    /**
     * Fields requiring encryption for HIPAA/GDPR/LGPD compliance
     */
    public const SENSITIVE_FIELDS = ['email', 'phone', 'address', 'medical_data'];

    /**
     * Password expiry period in days
     */
    public const PASSWORD_EXPIRY_DAYS = 90;

    /**
     * Maximum failed login attempts before account lockout
     */
    public const MAX_LOGIN_ATTEMPTS = 5;

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'users';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'language',
        'preferences',
        'consent_log'
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret'
    ];

    /**
     * The attributes that should be encrypted.
     *
     * @var array<int, string>
     */
    protected $encrypted = [
        'email',
        'phone',
        'address'
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'preferences' => 'json',
        'consent_log' => 'json',
        'is_locked' => 'boolean'
    ];

    /**
     * The attributes that should be mutated to dates.
     *
     * @var array<int, string>
     */
    protected $dates = [
        'email_verified_at',
        'password_changed_at',
        'last_login_at',
        'created_at',
        'updated_at',
        'deleted_at'
    ];

    /**
     * Get the enrollments associated with the user.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function enrollments()
    {
        $query = $this->hasMany(Enrollment::class, 'user_id');
        
        // Apply role-based scope
        if ($this->role === 'broker') {
            $query->where('broker_id', $this->id);
        } elseif ($this->role === 'individual') {
            $query->where('user_id', $this->id);
        }
        
        return $query;
    }

    /**
     * Get the interviews conducted by the user (for interviewer role).
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany|null
     */
    public function interviews()
    {
        if ($this->role !== 'interviewer') {
            return null;
        }
        
        return $this->hasMany(Interview::class, 'interviewer_id')
            ->where('status', '!=', 'cancelled');
    }

    /**
     * Check if user has a specific role.
     *
     * @param string $role
     * @return bool
     */
    public function hasRole(string $role): bool
    {
        if (!in_array($role, self::USER_ROLES)) {
            throw new \InvalidArgumentException('Invalid role specified');
        }

        $result = $this->role === $role;

        // Log role check for audit
        activity()
            ->performedOn($this)
            ->withProperties(['checked_role' => $role, 'result' => $result])
            ->log('role_check');

        return $result;
    }

    /**
     * Set user preference with validation.
     *
     * @param string $key
     * @param mixed $value
     * @return bool
     */
    public function setPreference(string $key, $value): bool
    {
        $allowedPreferences = ['notifications', 'language', 'timezone', 'accessibility'];
        
        if (!in_array($key, $allowedPreferences)) {
            throw new \InvalidArgumentException('Invalid preference key');
        }

        $preferences = $this->preferences ?? [];
        $preferences[$key] = strip_tags($value);
        $this->preferences = $preferences;

        activity()
            ->performedOn($this)
            ->withProperties(['key' => $key, 'value' => $value])
            ->log('preference_update');

        return $this->save();
    }

    /**
     * Record login attempt and manage account locking.
     *
     * @param bool $success
     * @param string $ip_address
     * @return void
     */
    public function recordLoginAttempt(bool $success, string $ip_address): void
    {
        if ($success) {
            $this->last_login_at = now();
            $this->last_login_ip = $ip_address;
            $this->failed_login_attempts = 0;
            $this->is_locked = false;
        } else {
            $this->failed_login_attempts++;
            
            if ($this->failed_login_attempts >= self::MAX_LOGIN_ATTEMPTS) {
                $this->is_locked = true;
            }
        }

        activity()
            ->performedOn($this)
            ->withProperties([
                'success' => $success,
                'ip_address' => $ip_address,
                'attempts' => $this->failed_login_attempts
            ])
            ->log('login_attempt');

        $this->save();
    }

    /**
     * Log user consent for GDPR/LGPD compliance.
     *
     * @param string $type
     * @param array $details
     * @return bool
     */
    public function logConsent(string $type, array $details): bool
    {
        $validTypes = ['data_processing', 'marketing', 'cookies', 'terms_of_service'];
        
        if (!in_array($type, $validTypes)) {
            throw new \InvalidArgumentException('Invalid consent type');
        }

        $details['timestamp'] = now();
        $details['ip_address'] = request()->ip();

        $consentLog = $this->consent_log ?? [];
        $consentLog[] = [
            'type' => $type,
            'details' => $details
        ];

        $this->consent_log = $consentLog;

        activity()
            ->performedOn($this)
            ->withProperties([
                'consent_type' => $type,
                'details' => $details
            ])
            ->log('consent_recorded');

        return $this->save();
    }
}