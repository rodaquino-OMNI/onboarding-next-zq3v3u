<?php

declare(strict_types=1);

use PhpCsFixer\Config;
use PhpCsFixer\Finder;

// Create finder instance with path configurations
$finder = Finder::create()
    ->in([
        'app',
        'config', 
        'database',
        'resources',
        'routes',
        'tests'
    ])
    ->exclude([
        'bootstrap/cache',
        'storage',
        'vendor'
    ])
    ->name('*.php')
    ->notName(['*.blade.php', '*.tpl.php'])
    ->ignoreDotFiles(true)
    ->ignoreVCS(true);

// Define comprehensive rule set
$rules = [
    // PHP Syntax Rules
    '@PSR2' => true,
    'array_syntax' => ['syntax' => 'short'],
    'ordered_imports' => [
        'sort_algorithm' => 'alpha',
        'imports_order' => ['class', 'function', 'const']
    ],
    'no_unused_imports' => true,
    'single_quote' => true,
    'trailing_comma_in_multiline' => [
        'elements' => ['arrays', 'arguments', 'parameters']
    ],
    'declare_strict_types' => true,
    'explicit_string_variable' => true,
    'fully_qualified_strict_types' => true,

    // Code Style Rules
    'binary_operator_spaces' => [
        'default' => 'single_space',
        'operators' => [
            '=>' => 'align_single_space_minimal'
        ]
    ],
    'blank_line_before_statement' => [
        'statements' => [
            'break',
            'continue', 
            'declare',
            'return',
            'throw',
            'try',
            'while',
            'for',
            'foreach',
            'if',
            'switch',
            'yield'
        ]
    ],
    'method_chaining_indentation' => true,
    'no_extra_blank_lines' => [
        'tokens' => [
            'break',
            'case',
            'continue',
            'curly_brace_block',
            'default',
            'extra',
            'parenthesis_brace_block',
            'return',
            'square_brace_block',
            'switch',
            'throw',
            'use'
        ]
    ],
    'class_attributes_separation' => [
        'elements' => [
            'const' => 'one',
            'method' => 'one',
            'property' => 'one',
            'trait_import' => 'none'
        ]
    ],
    'no_whitespace_in_blank_line' => true,
    'concat_space' => ['spacing' => 'one'],

    // Laravel Specific Rules
    'not_operator_with_successor_space' => true,
    'phpdoc_scalar' => true,
    'phpdoc_single_line_var_spacing' => true,
    'phpdoc_var_without_name' => true,
    'unary_operator_spaces' => true,
    'phpdoc_trim' => true,
    'phpdoc_types' => true,
    'phpdoc_order' => true,
    'phpdoc_separation' => true,
    'phpdoc_align' => ['align' => 'vertical'],
    'no_empty_phpdoc' => true,
];

// Create and export configuration
$config = new Config();
return $config
    ->setRules($rules)
    ->setFinder($finder)
    ->setRiskyAllowed(true)
    ->setCacheFile('.php-cs-fixer.cache');