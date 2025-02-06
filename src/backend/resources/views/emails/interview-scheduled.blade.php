<!DOCTYPE html>
<html lang="{{ $user->language ?? 'en' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
        /* Base styles with email client compatibility */
        :root {
            color-scheme: light dark;
            supported-color-schemes: light dark;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #2196F3;
            color: #ffffff;
            padding: 20px;
            text-align: center;
        }
        .content {
            background-color: #ffffff;
            padding: 20px;
        }
        .button {
            background-color: #2196F3;
            border-radius: 4px;
            color: #ffffff;
            display: inline-block;
            font-weight: bold;
            margin: 20px 0;
            padding: 12px 24px;
            text-decoration: none;
        }
        .footer {
            background-color: #f5f5f5;
            color: #666666;
            font-size: 12px;
            padding: 20px;
            text-align: center;
        }
        @media (prefers-color-scheme: dark) {
            .content {
                background-color: #1a1a1a;
                color: #ffffff;
            }
            .footer {
                background-color: #2d2d2d;
                color: #cccccc;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        {{-- HIPAA-compliant Security Banner --}}
        <div class="header">
            <h1>{{ __('emails.interview.header', [], $user->language) }}</h1>
            <p>{{ __('emails.interview.confidential_notice', [], $user->language) }}</p>
        </div>

        <div class="content">
            {{-- Localized Greeting --}}
            <p>{{ __('emails.interview.greeting', ['name' => $user->name], $user->language) }}</p>

            {{-- Interview Details --}}
            <p>{{ __('emails.interview.scheduled_info', [], $user->language) }}</p>
            
            {{-- Timezone-aware DateTime --}}
            <p><strong>{{ __('emails.interview.date_time', [], $user->language) }}:</strong><br>
                {{ Carbon\Carbon::parse($interview->scheduled_at)
                    ->setTimezone($user->preferences['timezone'] ?? 'UTC')
                    ->translatedFormat(__('emails.interview.date_format', [], $user->language)) }}
            </p>

            {{-- Interviewer Information --}}
            <p><strong>{{ __('emails.interview.interviewer', [], $user->language) }}:</strong><br>
                {{ $interview->interviewer->name }}
            </p>

            {{-- Secure Video Link --}}
            <p>{{ __('emails.interview.join_instructions', [], $user->language) }}</p>
            <a href="{{ $videoSessionUrl }}" class="button" target="_blank" rel="noopener">
                {{ __('emails.interview.join_button', [], $user->language) }}
            </a>

            {{-- Preparation Instructions --}}
            <h2>{{ __('emails.interview.preparation_header', [], $user->language) }}</h2>
            <ul>
                @foreach(__('emails.interview.preparation_steps', [], $user->language) as $step)
                    <li>{{ $step }}</li>
                @endforeach
            </ul>

            {{-- Technical Requirements --}}
            <p><strong>{{ __('emails.interview.technical_requirements', [], $user->language) }}:</strong></p>
            <ul>
                <li>{{ __('emails.interview.browser_requirement', [], $user->language) }}</li>
                <li>{{ __('emails.interview.camera_requirement', [], $user->language) }}</li>
                <li>{{ __('emails.interview.microphone_requirement', [], $user->language) }}</li>
                <li>{{ __('emails.interview.internet_requirement', [], $user->language) }}</li>
            </ul>

            {{-- Support Information --}}
            <p>{{ __('emails.interview.support_info', [], $user->language) }}</p>
            <p>{{ __('emails.interview.support_contact', [], $user->language) }}</p>
        </div>

        {{-- HIPAA-compliant Footer --}}
        <div class="footer">
            {{-- Privacy Notice --}}
            <p>{{ __('emails.interview.privacy_notice', [], $user->language) }}</p>

            {{-- Confidentiality Disclaimer --}}
            <p>{{ __('emails.interview.confidentiality_disclaimer', [], $user->language) }}</p>

            {{-- Accessibility Notice --}}
            @if($user->preferences['accessibility_preferences'] ?? false)
                <p>{{ __('emails.interview.accessibility_notice', [], $user->language) }}</p>
            @endif

            {{-- Unsubscribe Notice (GDPR/LGPD Compliance) --}}
            <p>{{ __('emails.interview.unsubscribe_notice', [], $user->language) }}</p>

            {{-- Security Notice --}}
            <p class="security-notice">
                {{ __('emails.interview.security_notice', [
                    'expiration' => Carbon\Carbon::parse($interview->scheduled_at)->addHours(2)->format('Y-m-d H:i T')
                ], $user->language) }}
            </p>
        </div>
    </div>
</body>
</html>