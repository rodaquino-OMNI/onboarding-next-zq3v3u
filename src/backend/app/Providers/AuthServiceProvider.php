<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Cache;
use Laravel\SecurityAudit\SecurityAudit;

/**
 * AuthServiceProvider for AUSTA Integration Platform
 * 
 * Implements comprehensive authentication and authorization services with
 * zero-trust security principles, audit logging, and compliance tracking.
 */
class AuthServiceProvider extends ServiceProvider
{
    /**
     * The policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [];

    /**
     * JWT token expiry in minutes
     * 
     * @var int
     */
    protected $tokenExpiryMinutes = 60;

    /**
     * Security configuration settings
     * 
     * @var array
     */
    protected $securityConfig = [
        'jwt' => [
            'algorithm' => 'RS256',
            'refresh_ttl' => 20160, // 14 days
            'blacklist_grace_period' => 30,
        ],
        'mfa' => [
            'required_roles' => ['admin', 'interviewer'],
            'remember_device_days' => 30,
        ],
        'audit' => [
            'storage_days' => 365,
            'alert_threshold' => 5,
        ]
    ];

    /**
     * Register any authentication / authorization services.
     *
     * @return void
     */
    public function boot(): void
    {
        $this->registerPolicies();
        $this->configureJWT();
        $this->setupAuditLogging();
        
        // Register role-based authorization gates
        Gate::before(function ($user, $ability) {
            if ($user->hasRole('admin')) {
                return true;
            }
        });

        // Enrollment management gates
        Gate::define('manage-enrollments', function (User $user) {
            return in_array($user->role, ['admin', 'broker']);
        });

        Gate::define('view-enrollment', function (User $user, $enrollment) {
            return $user->id === $enrollment->user_id 
                || $user->id === $enrollment->broker_id 
                || $user->hasRole('admin');
        });

        // Document management gates
        Gate::define('upload-documents', function (User $user, $enrollment) {
            return $user->id === $enrollment->user_id 
                || $user->hasRole('broker');
        });

        Gate::define('view-documents', function (User $user, $enrollment) {
            return $user->id === $enrollment->user_id 
                || $user->id === $enrollment->broker_id 
                || $user->hasRole('interviewer')
                || $user->hasRole('admin');
        });

        // Interview management gates
        Gate::define('conduct-interview', function (User $user) {
            return $user->hasRole('interviewer');
        });

        Gate::define('schedule-interview', function (User $user, $enrollment) {
            return $user->id === $enrollment->user_id 
                || $user->hasRole('broker')
                || $user->hasRole('admin');
        });

        // Health record gates
        Gate::define('manage-health-records', function (User $user, $enrollment) {
            return $user->hasRole('interviewer') 
                || $user->hasRole('admin');
        });

        Gate::define('view-health-records', function (User $user, $enrollment) {
            return $user->id === $enrollment->user_id 
                || ($user->hasRole('interviewer') && $user->id === $enrollment->interviewer_id)
                || $user->hasRole('admin');
        });

        // Audit log gates
        Gate::define('view-audit-logs', function (User $user) {
            return $user->hasRole('admin');
        });
    }

    /**
     * Register and cache authorization policies with audit logging
     *
     * @return void
     */
    protected function registerPolicies(): void
    {
        parent::registerPolicies();

        // Clear existing policy cache
        Cache::tags(['policies'])->flush();

        foreach ($this->policies as $model => $policy) {
            Gate::policy($model, $policy);
        }

        // Cache policies for performance
        $policies = collect($this->policies)->map(function ($policy) {
            return [
                'class' => $policy,
                'methods' => get_class_methods($policy)
            ];
        });

        Cache::tags(['policies'])->put('registered_policies', $policies, now()->addHours(24));

        // Log policy registration
        activity()
            ->withProperties(['policies' => $policies])
            ->log('policies_registered');
    }

    /**
     * Configure JWT settings with security best practices
     *
     * @return void
     */
    protected function configureJWT(): void
    {
        config([
            'sanctum.expiration' => $this->tokenExpiryMinutes,
            'sanctum.token_prefix' => env('APP_ENV') . '_',
            'sanctum.stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', '')),
            
            'jwt' => [
                'secret' => env('JWT_SECRET'),
                'keys' => [
                    'public' => storage_path('app/jwt/public.pem'),
                    'private' => storage_path('app/jwt/private.pem'),
                ],
                'algo' => $this->securityConfig['jwt']['algorithm'],
                'ttl' => $this->tokenExpiryMinutes,
                'refresh_ttl' => $this->securityConfig['jwt']['refresh_ttl'],
                'blacklist_grace_period' => $this->securityConfig['jwt']['blacklist_grace_period'],
                'blacklist_enabled' => true,
                'show_black_list_exception' => false,
                'decrypt_cookies' => true,
                'providers' => [
                    'jwt' => \Tymon\JWTAuth\Providers\JWT\Lcobucci::class,
                    'auth' => \Tymon\JWTAuth\Providers\Auth\Illuminate::class,
                    'storage' => \Tymon\JWTAuth\Providers\Storage\Illuminate::class,
                ],
            ]
        ]);
    }

    /**
     * Configure comprehensive security audit logging
     *
     * @return void
     */
    protected function setupAuditLogging(): void
    {
        $audit = new SecurityAudit();
        
        $audit->setStorageConfig([
            'driver' => 'daily',
            'days' => $this->securityConfig['audit']['storage_days'],
            'path' => storage_path('logs/security/audit.log'),
        ]);

        $audit->setAlertConfig([
            'threshold' => $this->securityConfig['audit']['alert_threshold'],
            'channels' => ['slack', 'email'],
            'recipients' => config('security.alert_recipients'),
        ]);

        $audit->registerEvents([
            'auth.login' => \App\Events\Auth\LoginEvent::class,
            'auth.logout' => \App\Events\Auth\LogoutEvent::class,
            'auth.failed' => \App\Events\Auth\FailedLoginEvent::class,
            'user.created' => \App\Events\User\CreatedEvent::class,
            'user.updated' => \App\Events\User\UpdatedEvent::class,
            'user.deleted' => \App\Events\User\DeletedEvent::class,
            'enrollment.created' => \App\Events\Enrollment\CreatedEvent::class,
            'enrollment.updated' => \App\Events\Enrollment\UpdatedEvent::class,
            'document.uploaded' => \App\Events\Document\UploadedEvent::class,
            'document.accessed' => \App\Events\Document\AccessedEvent::class,
            'health.record.accessed' => \App\Events\HealthRecord\AccessedEvent::class,
            'interview.conducted' => \App\Events\Interview\ConductedEvent::class,
        ]);

        $audit->enableRealTimeMonitoring();
    }
}