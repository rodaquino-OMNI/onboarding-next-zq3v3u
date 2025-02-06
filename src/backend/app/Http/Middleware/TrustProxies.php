<?php

namespace App\Http\Middleware;

use Fideloper\Proxy\TrustProxies as Middleware;
use Illuminate\Http\Request;

/**
 * Configures trusted proxies for secure request handling in zero-trust architecture.
 * Specifically handles AWS Application Load Balancer and GCP Cloud Load Balancer configurations.
 * 
 * @package App\Http\Middleware
 * @version 1.0.0
 * 
 * External Package Versions:
 * - fideloper/proxy: ^4.4
 * - laravel/framework: ^9.0
 */
class TrustProxies extends Middleware
{
    /**
     * The trusted proxies for the healthcare enrollment application.
     * 
     * AWS ALB IPs are dynamically resolved through AWS internal DNS.
     * GCP Load Balancer IPs are handled through internal network configuration.
     * 
     * Format options:
     * - String 'null' to trust none
     * - String '*' to trust all
     * - Array of IP addresses to trust specific proxies
     *
     * @var array|string|null
     */
    protected $proxies = [
        // AWS ALB internal CIDR ranges
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        // GCP Load Balancer internal ranges
        '130.211.0.0/22',
        '35.191.0.0/16'
    ];

    /**
     * The headers to be trusted from the proxies.
     * 
     * Configured for AWS ALB and GCP Load Balancer header forwarding:
     * - X-Forwarded-For (Client IP)
     * - X-Forwarded-Host (Original host requested)
     * - X-Forwarded-Port (Original port requested)
     * - X-Forwarded-Proto (Original protocol requested)
     * - X-Forwarded-AWS-ELB (AWS specific)
     *
     * @var int
     */
    protected $headers = Request::HEADER_X_FORWARDED_FOR |
                        Request::HEADER_X_FORWARDED_HOST |
                        Request::HEADER_X_FORWARDED_PORT |
                        Request::HEADER_X_FORWARDED_PROTO |
                        Request::HEADER_X_FORWARDED_AWS_ELB;
}