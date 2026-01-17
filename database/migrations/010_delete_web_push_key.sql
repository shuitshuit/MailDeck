ALTER TABLE public.web_push_subscriptions DROP COLUMN endpoint;
ALTER TABLE public.web_push_subscriptions DROP COLUMN p256dh;
ALTER TABLE public.web_push_subscriptions DROP COLUMN auth;
ALTER TABLE public.web_push_subscriptions ADD "token" varchar(255) NOT NULL;
ALTER TABLE public.web_push_subscriptions DROP COLUMN user_agent;
