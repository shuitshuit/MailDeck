-- Migration: 012_user_consent_logs
-- Description: Create user_consent_logs table for tracking terms of service and privacy policy consent

CREATE TABLE public.user_consent_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id varchar(255) NOT NULL,
    consent_type varchar(50) NOT NULL,
    consent_version varchar(20) NOT NULL,
    consented_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address varchar(45),
    user_agent text,
    CONSTRAINT user_consent_logs_pk PRIMARY KEY (id),
    CONSTRAINT user_consent_logs_users_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT user_consent_logs_uq_user_type_version UNIQUE (user_id, consent_type, consent_version)
);

-- Indexes for efficient querying
CREATE INDEX user_consent_logs_user_id_idx ON public.user_consent_logs (user_id);
CREATE INDEX user_consent_logs_consent_type_idx ON public.user_consent_logs (consent_type);

-- Comment on table and columns
COMMENT ON TABLE public.user_consent_logs IS 'Records user consent to terms of service and privacy policy';
COMMENT ON COLUMN public.user_consent_logs.consent_type IS 'Type of consent: terms_of_service or privacy_policy';
COMMENT ON COLUMN public.user_consent_logs.consent_version IS 'Version of the document consented to, e.g., v1.0';
COMMENT ON COLUMN public.user_consent_logs.ip_address IS 'IP address at time of consent for audit purposes';
COMMENT ON COLUMN public.user_consent_logs.user_agent IS 'User agent string at time of consent for audit purposes';
