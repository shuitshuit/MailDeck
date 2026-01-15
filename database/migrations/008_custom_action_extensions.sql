-- Migration: 008_custom_action_extensions.sql
-- Description: Phase 5 extensions - Link templates and usage statistics
-- Date: 2025-01-15

-- ============================================
-- 1. Add link_template column to custom_action_patterns
-- ============================================
-- For 'link' action type, this template generates URLs
-- Use {value} placeholder for the matched value
-- Example: https://track.example.com/{value}

ALTER TABLE custom_action_patterns
ADD COLUMN IF NOT EXISTS link_template VARCHAR(2048);

-- Add comment for documentation
COMMENT ON COLUMN custom_action_patterns.link_template IS
    'URL template for link action type. Use {value} as placeholder for matched value.';

-- ============================================
-- 2. Pattern usage statistics table
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id UUID NOT NULL REFERENCES custom_action_patterns(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'copy', 'link_click', 'highlight_copy'
    matched_value_hash VARCHAR(64), -- SHA-256 hash of matched value (for privacy)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for efficient querying
    CONSTRAINT fk_pattern_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pattern_usage_pattern FOREIGN KEY (pattern_id) REFERENCES custom_action_patterns(id) ON DELETE CASCADE
);

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_pattern_usage_user_id ON pattern_usage_stats(user_id);

-- Index for pattern-based queries
CREATE INDEX IF NOT EXISTS idx_pattern_usage_pattern_id ON pattern_usage_stats(pattern_id);

-- Index for time-based queries (for analytics)
CREATE INDEX IF NOT EXISTS idx_pattern_usage_created_at ON pattern_usage_stats(created_at);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_pattern_usage_user_pattern ON pattern_usage_stats(user_id, pattern_id);

-- ============================================
-- 3. System preset patterns table
-- ============================================
CREATE TABLE IF NOT EXISTS system_preset_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name VARCHAR(255) NOT NULL,
    pattern_type VARCHAR(50) NOT NULL CHECK (pattern_type IN ('otp', 'tracking', 'token', 'custom')),
    regex_pattern TEXT NOT NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('copy', 'link', 'highlight')),
    link_template VARCHAR(2048),
    priority INT DEFAULT 50 CHECK (priority >= 0 AND priority <= 999),
    description TEXT,
    category VARCHAR(100), -- e.g., 'authentication', 'shipping', 'general'
    is_recommended BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_system_presets_category ON system_preset_patterns(category);

-- ============================================
-- 4. Insert default system preset patterns
-- ============================================
INSERT INTO system_preset_patterns (pattern_name, pattern_type, regex_pattern, action_type, priority, description, category, is_recommended) VALUES
-- Authentication OTP patterns
('6桁数字OTP', 'otp', '\b\d{6}\b', 'copy', 100, '一般的な6桁の認証コード', 'authentication', true),
('8桁数字OTP', 'otp', '\b\d{8}\b', 'copy', 90, '8桁の認証コード', 'authentication', false),
('英数字認証コード', 'otp', '\b[A-Z0-9]{6,8}\b', 'copy', 80, '英数字混合の認証コード', 'authentication', false),
('ハイフン区切りOTP', 'otp', '\b\d{3}-\d{3}\b', 'copy', 70, '3-3形式のOTP', 'authentication', false),

-- Shipping tracking patterns with link templates
('ヤマト運輸追跡番号', 'tracking', '\b\d{12}\b', 'link', 60, 'ヤマト運輸の12桁追跡番号', 'shipping', true),
('佐川急便追跡番号', 'tracking', '\b\d{12}\b', 'link', 55, '佐川急便の12桁追跡番号', 'shipping', false),
('日本郵便追跡番号', 'tracking', '\b[A-Z]{2}\d{9}[A-Z]{2}\b', 'link', 50, '日本郵便の国際追跡番号形式', 'shipping', true),
('4-4-4形式追跡番号', 'tracking', '\b\d{4}-\d{4}-\d{4}\b', 'link', 45, 'ハイフン区切りの追跡番号', 'shipping', false),

-- Token patterns
('32文字16進数トークン', 'token', '\b[a-f0-9]{32}\b', 'copy', 30, 'MD5ハッシュ形式のトークン', 'general', false),
('UUID形式', 'token', '\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b', 'copy', 20, 'UUID形式の識別子', 'general', true),
('JWTトークン', 'token', 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', 'copy', 10, 'JSON Web Token', 'general', false),

-- Custom patterns
('クーポンコード', 'custom', '\b[A-Z]{4,8}\d{2,4}\b', 'copy', 40, '英字+数字のクーポンコード', 'shopping', false),
('注文番号', 'custom', '\b(ORD|ORDER|注文)[-#]?\d{6,10}\b', 'copy', 35, '注文番号パターン', 'shopping', true)

ON CONFLICT DO NOTHING;

-- Update link templates for shipping patterns
UPDATE system_preset_patterns SET link_template = 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?ESSION_ID=&INIT=1&SENT=3&NESSION_ID=&number01={value}' WHERE pattern_name = 'ヤマト運輸追跡番号';
UPDATE system_preset_patterns SET link_template = 'https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={value}' WHERE pattern_name = '佐川急便追跡番号';
UPDATE system_preset_patterns SET link_template = 'https://trackings.post.japanpost.jp/services/srv/search/?requestNo1={value}' WHERE pattern_name = '日本郵便追跡番号';
