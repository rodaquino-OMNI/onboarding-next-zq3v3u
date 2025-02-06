<?php

use Illuminate\View\ViewServiceProvider;

return [
    /*
    |--------------------------------------------------------------------------
    | View Storage Paths
    |--------------------------------------------------------------------------
    |
    | Most templating systems load templates from disk. Here you may specify
    | an array of paths that should be checked for your views. These paths
    | are checked in order when resolving views for maximum flexibility.
    |
    */
    'paths' => [
        resource_path('views'),
        resource_path('views/emails/en'),
        resource_path('views/emails/pt-BR'),
        resource_path('views/layouts'),
        resource_path('views/components'),
        resource_path('views/enrollment'),
        resource_path('views/interviews'),
        resource_path('views/notifications'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Compiled View Path
    |--------------------------------------------------------------------------
    |
    | This option determines where all the compiled Blade templates will be
    | stored for your application. Typically, this is within the storage
    | directory. However, as usual, you are free to change this value.
    |
    */
    'compiled' => env(
        'VIEW_COMPILED_PATH',
        realpath(storage_path('framework/views'))
    ),

    /*
    |--------------------------------------------------------------------------
    | View Cache Configuration
    |--------------------------------------------------------------------------
    |
    | Enterprise-grade view caching configuration with performance optimization
    | and monitoring capabilities. Includes fragment caching for partial views
    | and precompilation settings for production environments.
    |
    */
    'cache' => [
        'enabled' => env('VIEW_CACHE_ENABLED', true),
        'ttl' => env('VIEW_CACHE_TTL', 3600),
        'driver' => 'file',
        'path' => storage_path('framework/cache/views'),
        'precompile' => true,
        'fragment_cache' => true,
        'fragment_ttl' => 1800,
    ],

    /*
    |--------------------------------------------------------------------------
    | View Namespaces
    |--------------------------------------------------------------------------
    |
    | Blade has an underutilized namespace feature that allows you to handle
    | view package overrides without requiring a full path to be specified.
    | These namespaces are configured here for better organization.
    |
    */
    'namespaces' => [
        'enrollment' => resource_path('views/enrollment'),
        'emails' => resource_path('views/emails'),
        'components' => resource_path('views/components'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Template Types
    |--------------------------------------------------------------------------
    |
    | Defines the standard template types used across the platform for
    | consistent styling and layout management.
    |
    */
    'template_types' => [
        'enrollment-completed',
        'interview-scheduled',
        'document-uploaded',
        'verification-required',
        'approval-status',
    ],

    /*
    |--------------------------------------------------------------------------
    | Supported Languages
    |--------------------------------------------------------------------------
    |
    | List of supported languages for multi-language template support.
    | Templates are organized in language-specific subdirectories.
    |
    */
    'supported_languages' => [
        'en',
        'pt-BR',
    ],

    /*
    |--------------------------------------------------------------------------
    | Accessibility Configuration
    |--------------------------------------------------------------------------
    |
    | WCAG compliance settings for view rendering to ensure accessibility
    | standards are met across all templates.
    |
    */
    'accessibility' => [
        'aria_labels' => true,
        'alt_text' => true,
        'color_contrast' => 'WCAG AAA',
        'skip_links' => true,
        'keyboard_navigation' => true,
        'semantic_markup' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Security Settings
    |--------------------------------------------------------------------------
    |
    | Security-related configuration for view compilation and rendering
    | including escaping defaults and allowed includes.
    |
    */
    'security' => [
        'escape_by_default' => true,
        'allowed_includes' => [
            'layouts/*',
            'components/*',
        ],
        'compile_permissions' => '0755',
        'cache_permissions' => '0755',
    ],

    /*
    |--------------------------------------------------------------------------
    | Monitoring Configuration
    |--------------------------------------------------------------------------
    |
    | Settings for view-related performance monitoring and debugging
    | in production environments.
    |
    */
    'monitoring' => [
        'compile_metrics' => true,
        'render_timing' => true,
        'cache_stats' => true,
        'error_logging' => env('VIEW_DEBUG', false),
    ],
];