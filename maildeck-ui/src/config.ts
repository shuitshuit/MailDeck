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

// Helper to get config value with priority: Runtime Config (KV) > Vite Env (build-time) > Default
// NOTE: Vite が値を埋め込めるのは `import.meta.env.VITE_XXX` の静的なドット参照のみ。
// `import.meta.env[key]` のような動的アクセスは置換されず空になるため、
// Vite 由来の値は必ず呼び出し側で静的参照したものを viteValue として渡すこと。
const getConfig = (key: keyof RuntimeConfig, viteValue: string | undefined): string => {
    if (window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__[key]) {
        return window.__RUNTIME_CONFIG__[key]!;
    }
    return viteValue || '';
};

export const config = {
    aws: {
        region: getConfig('VITE_AWS_REGION', import.meta.env.VITE_AWS_REGION),
        userPoolId: getConfig('VITE_USER_POOL_ID', import.meta.env.VITE_USER_POOL_ID),
        userPoolClientId: getConfig('VITE_USER_POOL_CLIENT_ID', import.meta.env.VITE_USER_POOL_CLIENT_ID),
    },
    auth: {
        domain: getConfig('VITE_COGNITO_DOMAIN', import.meta.env.VITE_COGNITO_DOMAIN),
        redirectSignIn: getConfig('VITE_REDIRECT_URI', import.meta.env.VITE_REDIRECT_URI),
        redirectSignOut: getConfig('VITE_SIGNOUT_URI', import.meta.env.VITE_SIGNOUT_URI),
    }
};
