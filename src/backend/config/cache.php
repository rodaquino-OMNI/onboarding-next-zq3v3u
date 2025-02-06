<?php

use Illuminate\Support\Facades\Facade;

return [

    /*
    |--------------------------------------------------------------------------
    | Default Cache Store
    |--------------------------------------------------------------------------
    |
    | This option controls the default cache connection that gets used while
    | using this caching library. This connection is used when another is
    | not explicitly specified when executing a given caching function.
    |
    */

    'default' => env('CACHE_DRIVER', 'redis'),

    /*
    |--------------------------------------------------------------------------
    | Cache Stores
    |--------------------------------------------------------------------------
    |
    | Here you may define all of the cache "stores" for your application as
    | well as their drivers. You may even define multiple stores for the
    | same cache driver to group types of items stored in your caches.
    |
    */

    'stores' => [

        'redis' => [
            'driver' => 'redis',
            'connection' => 'cache',
            'lock_connection' => 'default',
            'cluster' => env('REDIS_CLUSTER', true),
            'nodes' => explode(',', env('REDIS_CLUSTER_NODES')),
            'prefix' => 'austa_cache',
            'retry_interval' => env('REDIS_RETRY_INTERVAL', 100),
            'read_timeout' => env('REDIS_READ_TIMEOUT', 1),
            'compression' => [
                'enabled' => true,
                'threshold' => '2048', // Compress values larger than 2KB
                'driver' => 'gzip'
            ],
            'pool' => [
                'min' => env('REDIS_POOL_MIN', 10),
                'max' => env('REDIS_POOL_MAX', 100)
            ],
            'sentinel' => [
                'enabled' => true,
                'master' => 'mymaster',
                'nodes' => env('REDIS_SENTINEL_NODES')
            ]
        ],

        'array' => [
            'driver' => 'array',
            'serialize' => false,
        ],

        'file' => [
            'driver' => 'file',
            'path' => storage_path('framework/cache/data'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Cache Key Prefix
    |--------------------------------------------------------------------------
    |
    | When utilizing the APC, database, memcached, Redis, or DynamoDB cache
    | stores there might be other applications using the same cache. For 
    | this reason, you may prefix every cache key to avoid collisions.
    |
    */

    'prefix' => env('CACHE_PREFIX', 'austa_cache'),

    /*
    |--------------------------------------------------------------------------
    | Cache Tags Prefix
    |--------------------------------------------------------------------------
    |
    | Prefix for cache tags to avoid collisions with other applications
    | using the same Redis instance.
    |
    */
    
    'tags_prefix' => env('CACHE_TAGS_PREFIX', 'austa_tags:'),

    /*
    |--------------------------------------------------------------------------
    | Cache TTL Configuration
    |--------------------------------------------------------------------------
    |
    | Default time-to-live settings for different cache types in seconds.
    | These can be overridden when calling specific cache operations.
    |
    */

    'ttl' => [
        'default' => 3600, // 1 hour
        'session' => 7200, // 2 hours
        'api' => 300,      // 5 minutes
        'query' => 1800,   // 30 minutes
        'health_check' => 60 // 1 minute
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache Events
    |--------------------------------------------------------------------------
    |
    | Enable/disable cache events for monitoring and debugging.
    | When enabled, cache operations will be logged for auditing.
    |
    */

    'events' => [
        'enabled' => env('CACHE_EVENTS_ENABLED', true),
        'channels' => ['stack', 'daily'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache Monitoring
    |--------------------------------------------------------------------------
    |
    | Configuration for cache monitoring and alerting thresholds.
    |
    */

    'monitoring' => [
        'enabled' => env('CACHE_MONITORING_ENABLED', true),
        'thresholds' => [
            'memory_usage' => 80, // Alert at 80% memory usage
            'hit_ratio' => 60,    // Alert if hit ratio falls below 60%
            'connection_count' => env('REDIS_POOL_MAX', 100)
        ]
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache Security
    |--------------------------------------------------------------------------
    |
    | Security settings for cache operations including encryption
    | and access controls.
    |
    */

    'security' => [
        'encrypt_values' => env('CACHE_ENCRYPT_VALUES', true),
        'allowed_ips' => explode(',', env('CACHE_ALLOWED_IPS', '')),
        'ssl_enabled' => env('REDIS_SSL_ENABLED', true)
    ],

];