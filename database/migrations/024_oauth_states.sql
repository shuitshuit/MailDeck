-- Migration: Persist OAuth authorization state in PostgreSQL
-- Description: The Google OAuth authorize/callback flow correlated requests with an
--              opaque `state` value kept only in the API pod's IMemoryCache. On k3s,
--              a RollingUpdate briefly runs the old and new pod side by side (maxSurge: 1),
--              and the Service can route /authorize to one pod and /callback to the
--              other - the new pod's cache never had the state, so consent completed
--              on Google's side but MailDeck rejected the callback as invalid_state and
--              never saved the account. The same happens on any pod restart between the
--              two requests, deploy-triggered or not. Moving the store to PostgreSQL
--              makes it survive across pods, matching the leasing pattern already used
--              for email checking (see migration 022).

CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    config_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
    ON oauth_states (expires_at);

COMMENT ON TABLE oauth_states
    IS 'Single-use OAuth authorize/callback correlation state, persisted so it survives pod restarts/rollouts between the two requests';
