// Type definition for the runtime config (injected by Cloudflare/Server)
interface RuntimeConfig {
    VITE_AWS_REGION?: string;
    VITE_USER_POOL_ID?: string;
    VITE_USER_POOL_CLIENT_ID?: string;
    VITE_COGNITO_DOMAIN?: string;
    VITE_REDIRECT_URI?: string;
    VITE_SIGNOUT_URI?: string;
}

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: RuntimeConfig;
    }
}

// Helper to get config value with priority: Runtime Config (KV) > Vite Env (Local) > Default
const getConfig = (key: keyof RuntimeConfig, viteKey: string): string => {
    if (window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__[key]) {
        return window.__RUNTIME_CONFIG__[key]!;
    }
    return import.meta.env[viteKey] || '';
};

export const config = {
    aws: {
        region: getConfig('VITE_AWS_REGION', 'VITE_AWS_REGION'),
        userPoolId: getConfig('VITE_USER_POOL_ID', 'VITE_USER_POOL_ID'),
        userPoolClientId: getConfig('VITE_USER_POOL_CLIENT_ID', 'VITE_USER_POOL_CLIENT_ID'),
    },
    auth: {
        domain: getConfig('VITE_COGNITO_DOMAIN', 'VITE_COGNITO_DOMAIN'),
        redirectSignIn: getConfig('VITE_REDIRECT_URI', 'VITE_REDIRECT_URI'),
        redirectSignOut: getConfig('VITE_SIGNOUT_URI', 'VITE_SIGNOUT_URI'),
    }
};
