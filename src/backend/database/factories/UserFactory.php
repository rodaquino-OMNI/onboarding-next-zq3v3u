<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;

/**
 * Factory for generating compliant test user data with configurable roles,
 * preferences, and security attributes for the healthcare enrollment platform.
 *
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = User::class;

    /**
     * Supported languages for user generation.
     *
     * @var array<string>
     */
    protected const SUPPORTED_LANGUAGES = ['en', 'pt-BR'];

    /**
     * Default user preferences configuration.
     *
     * @var array<string, mixed>
     */
    protected const DEFAULT_PREFERENCES = [
        'notifications' => [
            'email' => true,
            'sms' => false,
            'push' => true
        ],
        'accessibility' => [
            'high_contrast' => false,
            'font_size' => 'medium'
        ],
        'privacy' => [
            'profile_visibility' => 'private',
            'data_sharing' => 'minimal'
        ]
    ];

    /**
     * Define the model's default state with compliance considerations.
     *
     * @return array<string, mixed>
     */
    public function definition()
    {
        $name = $this->faker->name();
        $email = Str::slug($name) . '.' . $this->faker->numberBetween(100, 999) . '@' . $this->faker->safeEmailDomain();
        
        return [
            'id' => Str::uuid(),
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('Password123!'), // Default test password
            'password_changed_at' => Carbon::now(),
            'role' => 'individual',
            'language' => 'en',
            'preferences' => self::DEFAULT_PREFERENCES,
            'consent_log' => [
                [
                    'type' => 'terms_of_service',
                    'timestamp' => Carbon::now()->toIso8601String(),
                    'ip_address' => '127.0.0.1',
                    'version' => '1.0'
                ]
            ],
            'email_verified_at' => Carbon::now(),
            'failed_login_attempts' => 0,
            'is_locked' => false,
            'last_login_at' => null,
            'last_login_ip' => null,
            'security_metadata' => [
                'password_history' => [],
                'security_questions' => null,
                'mfa_enabled' => false,
                'last_security_update' => Carbon::now()->toIso8601String()
            ],
            'remember_token' => null,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now()
        ];
    }

    /**
     * Set the user as unverified.
     *
     * @return static
     */
    public function unverified()
    {
        return $this->state(function (array $attributes) {
            return [
                'email_verified_at' => null
            ];
        });
    }

    /**
     * Set the user role.
     *
     * @param string $role
     * @return static
     * @throws \InvalidArgumentException
     */
    public function role(string $role)
    {
        if (!in_array($role, User::USER_ROLES)) {
            throw new \InvalidArgumentException('Invalid role specified');
        }

        return $this->state(function (array $attributes) use ($role) {
            return [
                'role' => $role,
                'security_metadata' => array_merge(
                    $attributes['security_metadata'] ?? [],
                    ['role_assigned_at' => Carbon::now()->toIso8601String()]
                )
            ];
        });
    }

    /**
     * Add failed login attempts to the user.
     *
     * @param int $attempts
     * @return static
     */
    public function withFailedLogins(int $attempts)
    {
        if ($attempts < 0 || $attempts > User::MAX_LOGIN_ATTEMPTS) {
            throw new \InvalidArgumentException('Invalid number of attempts');
        }

        return $this->state(function (array $attributes) use ($attempts) {
            $isLocked = $attempts >= User::MAX_LOGIN_ATTEMPTS;
            
            return [
                'failed_login_attempts' => $attempts,
                'is_locked' => $isLocked,
                'security_metadata' => array_merge(
                    $attributes['security_metadata'] ?? [],
                    [
                        'last_failed_login' => $attempts > 0 ? Carbon::now()->toIso8601String() : null,
                        'lockout_timestamp' => $isLocked ? Carbon::now()->toIso8601String() : null
                    ]
                )
            ];
        });
    }

    /**
     * Add consent history records for compliance.
     *
     * @param array $consents
     * @return static
     */
    public function withConsentHistory(array $consents)
    {
        $validTypes = ['data_processing', 'marketing', 'cookies', 'terms_of_service'];
        
        foreach ($consents as $consent) {
            if (!in_array($consent['type'] ?? '', $validTypes)) {
                throw new \InvalidArgumentException('Invalid consent type specified');
            }
        }

        return $this->state(function (array $attributes) use ($consents) {
            $consentLog = array_map(function ($consent) {
                return array_merge($consent, [
                    'timestamp' => Carbon::now()->subMinutes(rand(1, 1000))->toIso8601String(),
                    'ip_address' => '127.0.0.1',
                    'version' => $consent['version'] ?? '1.0'
                ]);
            }, $consents);

            return [
                'consent_log' => array_merge($attributes['consent_log'] ?? [], $consentLog)
            ];
        });
    }

    /**
     * Generate comprehensive audit trail for user.
     *
     * @param array $events
     * @return static
     */
    public function withAuditTrail(array $events)
    {
        $validEvents = ['login', 'password_change', 'profile_update', 'consent_update', 'security_update'];
        
        foreach ($events as $event) {
            if (!in_array($event['type'] ?? '', $validEvents)) {
                throw new \InvalidArgumentException('Invalid audit event type');
            }
        }

        return $this->state(function (array $attributes) use ($events) {
            $auditTrail = array_map(function ($event) {
                return array_merge($event, [
                    'timestamp' => Carbon::now()->subMinutes(rand(1, 1000))->toIso8601String(),
                    'ip_address' => '127.0.0.1',
                    'user_agent' => 'PHPUnit Test Runner'
                ]);
            }, $events);

            return [
                'security_metadata' => array_merge(
                    $attributes['security_metadata'] ?? [],
                    ['audit_trail' => $auditTrail]
                )
            ];
        });
    }
}