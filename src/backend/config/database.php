<?php

use Illuminate\Support\Str;

return [

    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for all database work.
    |
    */

    'default' => env('DB_CONNECTION', 'mysql'),

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Configure each database connection with proper security settings,
    | encryption, and high availability support.
    |
    */

    'connections' => [

        'mysql' => [
            'driver' => 'mysql',
            'version' => '8.0',
            'read' => [
                'host' => [
                    env('DB_READ_HOST1', '127.0.0.1'),
                    env('DB_READ_HOST2', '127.0.0.1'),
                ],
            ],
            'write' => [
                'host' => [
                    env('DB_WRITE_HOST', '127.0.0.1'),
                ],
            ],
            'sticky' => true,
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'austa_platform'),
            'username' => env('DB_USERNAME', 'forge'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'timezone' => '+00:00',
            'options' => [
                PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA', '/path/to/rds-ca-2019-root.pem'),
                PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
                PDO::ATTR_PERSISTENT => false,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 5,
                PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
                PDO::MYSQL_ATTR_COMPRESS => true,
            ],
        ],

        'mysql_dr' => [
            'driver' => 'mysql',
            'version' => '8.0',
            'host' => env('DR_DB_HOST', '127.0.0.1'),
            'port' => env('DR_DB_PORT', '3306'),
            'database' => env('DR_DB_DATABASE', 'austa_platform_dr'),
            'username' => env('DR_DB_USERNAME', 'forge'),
            'password' => env('DR_DB_PASSWORD', ''),
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'timezone' => '+00:00',
            'options' => [
                PDO::MYSQL_ATTR_SSL_CA => env('DR_MYSQL_ATTR_SSL_CA', '/path/to/google-cloud-sql-cert.pem'),
                PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
                PDO::ATTR_PERSISTENT => false,
                PDO::ATTR_TIMEOUT => 5,
            ],
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run in the database.
    |
    */

    'migrations' => 'migrations',

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system.
    |
    */

    'redis' => [
        'client' => env('REDIS_CLIENT', 'phpredis'),
        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', 'austa_database_'),
            'parameters' => [
                'password' => env('REDIS_PASSWORD'),
                'scheme' => 'tls',
                'ssl' => ['verify_peer', 'verify_peer_name'],
                'timeout' => 1.0,
                'read_timeout' => 1.0,
                'retry_interval' => 100,
                'read_write_timeout' => 0.0,
            ],
        ],

        'clusters' => [
            'default' => [
                [
                    'host' => env('REDIS_HOST1', '127.0.0.1'),
                    'password' => env('REDIS_PASSWORD'),
                    'port' => env('REDIS_PORT', 6379),
                    'database' => env('REDIS_DB', 0),
                ],
                [
                    'host' => env('REDIS_HOST2', '127.0.0.1'),
                    'password' => env('REDIS_PASSWORD'),
                    'port' => env('REDIS_PORT', 6379),
                    'database' => env('REDIS_DB', 0),
                ],
                [
                    'host' => env('REDIS_HOST3', '127.0.0.1'),
                    'password' => env('REDIS_PASSWORD'),
                    'port' => env('REDIS_PORT', 6379),
                    'database' => env('REDIS_DB', 0),
                ],
            ],
        ],

        'cache' => [
            'url' => env('REDIS_CACHE_URL'),
            'host' => env('REDIS_CACHE_HOST', '127.0.0.1'),
            'password' => env('REDIS_CACHE_PASSWORD'),
            'port' => env('REDIS_CACHE_PORT', 6379),
            'database' => env('REDIS_CACHE_DB', 1),
        ],
    ],
];