<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Auth\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Role-Based Access Control Middleware
 * 
 * Implements comprehensive role validation and access control with audit logging
 * for HIPAA, GDPR, and LGPD compliance.
 *
 * @package App\Http\Middleware
 */
class CheckRole
{
    /**
     * Handle an incoming request with role-based authorization.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @param  string|array  $roles  Required role(s) for access
     * @return mixed
     * @throws \Illuminate\Auth\AuthorizationException
     */
    public function handle(Request $request, Closure $next, $roles)
    {
        // Ensure user is authenticated
        if (!$request->user()) {
            Log::warning('Unauthenticated access attempt', [
                'ip' => $request->ip(),
                'path' => $request->path(),
                'user_agent' => $request->userAgent()
            ]);
            
            throw new AuthorizationException('Authentication required for this resource.');
        }

        // Convert string role to array for consistent processing
        $requiredRoles = is_array($roles) ? $roles : explode('|', $roles);

        // Validate roles against User::USER_ROLES
        foreach ($requiredRoles as $role) {
            if (!in_array($role, User::USER_ROLES)) {
                Log::error('Invalid role specified in middleware', [
                    'role' => $role,
                    'path' => $request->path()
                ]);
                throw new AuthorizationException('Invalid role configuration.');
            }
        }

        $user = $request->user();
        
        // Validate user roles
        if (!$this->validateRoles($user, $requiredRoles)) {
            // Log unauthorized access attempt for security audit
            Log::warning('Unauthorized access attempt', [
                'user_id' => $user->id,
                'user_role' => $user->role,
                'required_roles' => $requiredRoles,
                'ip' => $request->ip(),
                'path' => $request->path(),
                'method' => $request->method()
            ]);

            activity()
                ->performedOn($user)
                ->withProperties([
                    'required_roles' => $requiredRoles,
                    'path' => $request->path(),
                    'ip' => $request->ip()
                ])
                ->log('unauthorized_access');

            throw new AuthorizationException(
                'Access denied. Required role(s): ' . implode(', ', $requiredRoles)
            );
        }

        // Log successful authorization for audit trail
        Log::info('Authorized access', [
            'user_id' => $user->id,
            'user_role' => $user->role,
            'required_roles' => $requiredRoles,
            'path' => $request->path()
        ]);

        activity()
            ->performedOn($user)
            ->withProperties([
                'required_roles' => $requiredRoles,
                'path' => $request->path(),
                'success' => true
            ])
            ->log('authorized_access');

        return $next($request);
    }

    /**
     * Validate user roles against required roles.
     *
     * @param  \App\Models\User  $user
     * @param  array  $requiredRoles
     * @return bool
     */
    protected function validateRoles(User $user, array $requiredRoles): bool
    {
        // Admin role has access to everything
        if ($user->role === 'admin') {
            return true;
        }

        // Check if user has any of the required roles
        foreach ($requiredRoles as $role) {
            if ($user->hasRole($role)) {
                return true;
            }
        }

        return false;
    }
}