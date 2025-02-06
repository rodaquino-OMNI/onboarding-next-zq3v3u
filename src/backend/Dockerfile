# Stage 1: Composer dependencies
FROM composer:2.0 AS composer

# Copy composer files
COPY composer.json composer.lock ./

# Install production dependencies with optimized autoloader
RUN composer install --no-dev --optimize-autoloader --no-scripts --no-progress

# Stage 2: Final image
FROM php:8.1-fpm-alpine

# Set working directory
WORKDIR /var/www/html

# Install system dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    postgresql-dev \
    libzip-dev \
    oniguruma-dev \
    linux-headers \
    $PHPIZE_DEPS \
    && rm -rf /var/cache/apk/*

# Install PHP extensions
RUN docker-php-ext-install \
    pdo_mysql \
    pdo_pgsql \
    bcmath \
    opcache \
    zip \
    pcntl \
    && pecl install redis \
    && docker-php-ext-enable redis

# Configure PHP
COPY docker/php/php.ini /usr/local/etc/php/conf.d/custom.ini

# Configure Nginx
COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
RUN mkdir -p /var/log/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && mkdir -p /var/www/html/public

# Configure Supervisor
COPY docker/supervisord/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
RUN mkdir -p /var/log/supervisor \
    && chown -R www-data:www-data /var/log/supervisor

# Create necessary directories with proper permissions
RUN mkdir -p /var/www/html/storage/logs \
    /var/www/html/storage/framework/cache \
    /var/www/html/storage/framework/sessions \
    /var/www/html/storage/framework/views \
    && chown -R www-data:www-data /var/www/html/storage

# Copy application code
COPY --from=composer /app/vendor /var/www/html/vendor
COPY . /var/www/html
RUN chown -R www-data:www-data /var/www/html

# Configure OPcache
RUN { \
    echo 'opcache.memory_consumption=256'; \
    echo 'opcache.interned_strings_buffer=16'; \
    echo 'opcache.max_accelerated_files=20000'; \
    echo 'opcache.validate_timestamps=0'; \
    echo 'opcache.fast_shutdown=1'; \
    echo 'opcache.enable_cli=1'; \
} > /usr/local/etc/php/conf.d/opcache.ini

# Set environment variables
ENV PHP_MEMORY_LIMIT=512M \
    PHP_MAX_EXECUTION_TIME=300 \
    NGINX_WORKER_PROCESSES=auto \
    PHP_FPM_PM_MAX_CHILDREN=50

# Expose ports
EXPOSE 80 9000

# Set up health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost/api/health || exit 1

# Set up volumes
VOLUME ["/var/www/html/storage", "/var/log/nginx", "/var/log/php", "/var/log/supervisor"]

# Switch to non-root user
USER www-data

# Start services using Supervisor
ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]