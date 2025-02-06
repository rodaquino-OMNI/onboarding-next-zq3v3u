<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
| Package: illuminate/routing ^9.0
|
*/

// Health check route for load balancers
Route::get('/health', function () {
    return response()->json(['status' => 'healthy'], 200);
})->name('health.check');

// Static asset caching headers
Route::pattern('static', '.*\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$');
Route::get('/{static}', function () {
    return response()->file(public_path(request()->path()), [
        'Cache-Control' => 'public, max-age=31536000',
        'Expires' => gmdate('D, d M Y H:i:s \G\M\T', time() + 31536000),
    ]);
})->where('static', '.*\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$');

// SPA Routes - Catch all non-API routes and serve the Angular application
Route::get('/{any}', function () {
    return response()->view('app', [], 200)
        ->header('X-Frame-Options', 'DENY')
        ->header('X-Content-Type-Options', 'nosniff')
        ->header('X-XSS-Protection', '1; mode=block')
        ->header('Referrer-Policy', 'strict-origin-when-cross-origin')
        ->header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.austa.health");
})
->where('any', '^(?!api).*$') // Exclude API routes
->middleware(['web']) // Apply web middleware group
->name('spa');

// Fallback route for direct URL access
Route::fallback(function () {
    return response()->view('app', [], 200);
});