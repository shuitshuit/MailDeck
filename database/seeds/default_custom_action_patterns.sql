-- Default Custom Action Patterns
-- These are sample patterns that users can reference or import
-- Note: Replace 'YOUR_USER_ID' with actual user_id (Cognito sub) when using

-- 1. 6桁数字OTP (e.g., 123456)
-- Pattern matches exactly 6 consecutive digits
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    '6桁数字OTP',
    'otp',
    '\b\d{6}\b',
    'copy',
    100,
    true,
    '6桁の数字コード（例: 123456）。認証コードやワンタイムパスワードに使用されます。'
);

-- 2. 8桁数字OTP (e.g., 12345678)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    '8桁数字OTP',
    'otp',
    '\b\d{8}\b',
    'copy',
    90,
    true,
    '8桁の数字コード（例: 12345678）。'
);

-- 3. 英数字混合コード (e.g., ABC123, XYZ789)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    '英数字混合コード（6-8文字）',
    'otp',
    '\b[A-Z0-9]{6,8}\b',
    'copy',
    80,
    true,
    '6〜8文字の英数字コード（例: ABC123, XYZ789）。大文字のみ。'
);

-- 4. ハイフン区切り数字 (e.g., 123-456)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    'ハイフン区切りコード（数字）',
    'otp',
    '\b\d{3}-\d{3}\b',
    'copy',
    70,
    true,
    '3桁-3桁の数字コード（例: 123-456）。'
);

-- 5. ハイフン区切り英数字 (e.g., ABC-123)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    'ハイフン区切りコード（英数字）',
    'otp',
    '\b[A-Z]{3}-\d{3}\b',
    'copy',
    60,
    true,
    '3文字-3桁の英数字コード（例: ABC-123）。'
);

-- 6. 追跡番号（12桁ハイフン区切り） (e.g., 1234-5678-9012)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    '追跡番号（4-4-4桁）',
    'tracking',
    '\b\d{4}-\d{4}-\d{4}\b',
    'copy',
    50,
    true,
    '配送追跡番号（例: 1234-5678-9012）。'
);

-- 7. 長い英数字追跡番号 (e.g., ABC123456789)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    '英数字追跡番号（12文字）',
    'tracking',
    '\b[A-Z]{3}\d{9}\b',
    'copy',
    40,
    true,
    '3文字+9桁の追跡番号（例: ABC123456789）。'
);

-- 8. 32文字16進数トークン (e.g., a1b2c3d4e5f6...)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    'トークン（32文字16進数）',
    'token',
    '\b[a-f0-9]{32}\b',
    'copy',
    30,
    true,
    '32文字の16進数トークン（例: a1b2c3d4e5f6...）。APIキーやアクセストークンに使用されます。'
);

-- 9. UUID形式 (e.g., 550e8400-e29b-41d4-a716-446655440000)
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    'UUID形式',
    'token',
    '\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b',
    'copy',
    20,
    true,
    'UUID形式のID（例: 550e8400-e29b-41d4-a716-446655440000）。'
);

-- 10. JWTトークン（簡易版 - ヘッダー部分のみマッチ）
INSERT INTO custom_action_patterns (id, user_id, pattern_name, pattern_type, regex_pattern, action_type, priority, is_enabled, description)
VALUES (
    gen_random_uuid(),
    'YOUR_USER_ID',
    'JWTトークン',
    'token',
    'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    'copy',
    10,
    true,
    'JWTトークン（例: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...）。'
);

-- Note: These patterns are examples. Users should test and adjust them based on their specific needs.
-- To use these patterns:
-- 1. Replace 'YOUR_USER_ID' with your actual Cognito user_id
-- 2. Test patterns with sample emails to ensure they work as expected
-- 3. Adjust priority values to control which patterns are evaluated first
-- 4. Disable patterns you don't need by setting is_enabled = false
