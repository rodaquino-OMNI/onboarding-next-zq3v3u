<!DOCTYPE html>
<html lang="{{ $user->language ?? 'en' }}" dir="{{ in_array($user->language, ['ar', 'he']) ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <meta name="x-apple-disable-message-reformatting">
    @foreach(config('security.email_headers') as $header => $value)
        <meta name="{{ $header }}" content="{{ $value }}">
    @endforeach
    <title>{{ __('emails.enrollment.completed.subject') }}</title>
    <style>
        /* Base styles with accessibility focus */
        :root {
            color-scheme: light dark;
            supported-color-schemes: light dark;
        }
        body {
            font-family: 'Roboto', Arial, sans-serif;
            line-height: 1.5;
            color: #000000;
            background-color: #FFFFFF;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #121212;
                color: #FFFFFF;
            }
        }
        /* High contrast and accessibility */
        .header {
            background-color: #2196F3;
            color: #FFFFFF;
            padding: 24px;
            text-align: center;
        }
        .content {
            padding: 24px;
            background-color: #FFFFFF;
            color: #000000;
        }
        .footer {
            padding: 24px;
            text-align: center;
            font-size: 14px;
        }
        .button {
            background-color: #2196F3;
            color: #FFFFFF;
            padding: 16px 32px;
            text-decoration: none;
            border-radius: 4px;
            display: inline-block;
            margin: 16px 0;
        }
        /* Responsive design */
        @media screen and (max-width: 600px) {
            .content {
                padding: 16px;
            }
            .button {
                width: 100%;
                text-align: center;
                box-sizing: border-box;
            }
        }
    </style>
</head>
<body>
    {{-- Semantic structure with ARIA landmarks --}}
    <div role="banner" class="header">
        <img src="{{ asset('images/logo.png') }}" 
             alt="{{ config('app.name') }}" 
             width="150" 
             height="50"
             style="max-width: 100%; height: auto;">
    </div>

    <div role="main" class="content">
        {{-- Personalized greeting with XSS protection --}}
        <h1>{{ __('emails.enrollment.completed.greeting', ['name' => e($user->name)]) }}</h1>

        {{-- Main message with masked PHI data --}}
        <p>{{ __('emails.enrollment.completed.message') }}</p>

        {{-- Enrollment details with HIPAA-compliant data masking --}}
        <div role="region" aria-label="{{ __('emails.enrollment.completed.details_section') }}">
            <p><strong>{{ __('emails.enrollment.completed.enrollment_id') }}:</strong> {{ substr($enrollment->id, 0, 8) }}****</p>
            <p><strong>{{ __('emails.enrollment.completed.completed_date') }}:</strong> 
                {{ $enrollment->completed_at->formatLocalized('%x') }}
            </p>
        </div>

        {{-- Secure action button with tracking --}}
        <a href="{{ $secureUrl }}" 
           class="button" 
           role="button" 
           aria-label="{{ __('emails.enrollment.completed.view_details_aria') }}">
            {{ __('emails.enrollment.completed.view_details') }}
        </a>

        {{-- Next steps section --}}
        <div role="region" aria-label="{{ __('emails.enrollment.completed.next_steps_section') }}">
            <h2>{{ __('emails.enrollment.completed.next_steps_title') }}</h2>
            <ul>
                @foreach(__('emails.enrollment.completed.next_steps') as $step)
                    <li>{{ $step }}</li>
                @endforeach
            </ul>
        </div>
    </div>

    {{-- Footer with compliance information --}}
    <div role="contentinfo" class="footer">
        {{-- HIPAA compliance notice --}}
        <p>{{ __('emails.enrollment.completed.hipaa_notice') }}</p>

        {{-- Privacy and security links --}}
        <p>
            <a href="{{ route('privacy-policy') }}" style="color: #2196F3;">
                {{ __('emails.enrollment.completed.privacy_policy') }}
            </a>
            |
            <a href="{{ route('terms-of-service') }}" style="color: #2196F3;">
                {{ __('emails.enrollment.completed.terms_of_service') }}
            </a>
        </p>

        {{-- Unsubscribe option with accessibility --}}
        <p>
            <a href="{{ route('notifications.unsubscribe', ['token' => $unsubscribeToken]) }}"
               style="color: #757575;"
               aria-label="{{ __('emails.enrollment.completed.unsubscribe_aria') }}">
                {{ __('emails.enrollment.completed.unsubscribe') }}
            </a>
        </p>

        {{-- Contact information --}}
        <p style="color: #757575;">
            {{ config('app.name') }}<br>
            {{ config('app.contact_email') }}<br>
            {{ config('app.contact_phone') }}
        </p>
    </div>

    {{-- Hidden metadata for email clients --}}
    <div aria-hidden="true" style="display: none; max-height: 0; overflow: hidden;">
        {{ __('emails.enrollment.completed.email_client_preview') }}
    </div>
</body>
</html>