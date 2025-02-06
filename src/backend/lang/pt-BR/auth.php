<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Mensagens de Autenticação em Português do Brasil
    |--------------------------------------------------------------------------
    |
    | As seguintes linhas de idioma são utilizadas durante a autenticação para
    | vários tipos de mensagens que precisamos exibir ao usuário. Você é livre
    | para modificar estas linhas de idioma de acordo com os requisitos da
    | sua aplicação.
    |
    | Codificação: UTF-8
    | Contexto: Sistema de Saúde
    | Formalidade: Português Formal
    | Conformidade: LGPD
    |
    */

    'failed' => 'As credenciais informadas não correspondem aos nossos registros.',
    
    'password' => 'A senha informada está incorreta.',
    
    'throttle' => 'Excesso de tentativas de login. Por favor, tente novamente em :seconds segundos.',
    
    'login_success' => 'Login realizado com sucesso. Bem-vindo ao sistema.',
    
    'logout_success' => 'Sessão encerrada com sucesso. Até logo.',
    
    'registration_success' => 'Cadastro realizado com sucesso. Bem-vindo à plataforma AUSTA.',
    
    'token_invalid' => 'O token de autenticação é inválido.',
    
    'token_expired' => 'Sua sessão expirou. Por favor, faça login novamente.',
    
    'unauthorized' => 'Você não possui autorização para acessar este recurso.',
    
    'mfa_required' => 'Por segurança, é necessária a autenticação de dois fatores.',

    /*
    |--------------------------------------------------------------------------
    | Mensagens de Erro de Validação
    |--------------------------------------------------------------------------
    */
    
    'validation' => [
        'email' => [
            'required' => 'O endereço de e-mail é obrigatório.',
            'email' => 'Por favor, informe um endereço de e-mail válido.',
            'unique' => 'Este endereço de e-mail já está em uso.',
        ],
        'password' => [
            'required' => 'A senha é obrigatória.',
            'min' => 'A senha deve ter no mínimo :min caracteres.',
            'confirmed' => 'A confirmação de senha não corresponde.',
        ],
        'terms' => 'Você deve aceitar os termos de uso e a política de privacidade.',
    ],

    /*
    |--------------------------------------------------------------------------
    | Mensagens de Recuperação de Senha
    |--------------------------------------------------------------------------
    */
    
    'password_reset' => [
        'sent' => 'Enviamos um link de redefinição de senha para seu e-mail.',
        'token' => 'O token de redefinição de senha é inválido.',
        'user' => 'Não encontramos um usuário com este endereço de e-mail.',
        'success' => 'Sua senha foi redefinida com sucesso.',
        'throttled' => 'Por favor, aguarde antes de tentar novamente.',
    ],

    /*
    |--------------------------------------------------------------------------
    | Mensagens de Verificação de E-mail
    |--------------------------------------------------------------------------
    */
    
    'verification' => [
        'sent' => 'Um novo link de verificação foi enviado para seu e-mail.',
        'verified' => 'Seu endereço de e-mail foi verificado com sucesso.',
        'already_verified' => 'Seu endereço de e-mail já foi verificado.',
        'user' => 'Não foi possível encontrar um usuário com este endereço de e-mail.',
        'throttled' => 'Por favor, aguarde antes de solicitar outro link.',
    ],

    /*
    |--------------------------------------------------------------------------
    | Mensagens de Segurança
    |--------------------------------------------------------------------------
    */
    
    'security' => [
        'session_expired' => 'Sua sessão expirou por inatividade. Por favor, faça login novamente.',
        'ip_changed' => 'Detectamos um acesso de um novo local. Por favor, verifique seu e-mail.',
        'device_changed' => 'Detectamos um acesso de um novo dispositivo. Por favor, confirme sua identidade.',
        'suspicious_activity' => 'Detectamos atividade suspeita. Por favor, altere sua senha.',
    ],
];