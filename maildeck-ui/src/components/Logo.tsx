import { useId } from 'react';

interface LogoProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showText?: boolean;
    className?: string;
}

const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
    xl: { icon: 56, text: 'text-3xl' },
};

export default function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
    const { icon, text } = sizes[size];
    const uniqueId = useId();
    const gradientId = `logoGradient-${uniqueId}`;
    const flapGradientId = `flapGradient-${uniqueId}`;

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <svg
                width={icon}
                height={icon}
                viewBox="0 0 56 56"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Background rounded square */}
                <rect
                    width="56"
                    height="56"
                    rx="12"
                    fill={`url(#${gradientId})`}
                />

                {/* Mail envelope body */}
                <rect
                    x="10"
                    y="16"
                    width="36"
                    height="26"
                    rx="3"
                    fill="white"
                />

                {/* Mail envelope flap (triangle) */}
                <path
                    d="M10 19L28 31L46 19"
                    stroke={`url(#${flapGradientId})`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />

                {/* Deck lines (stacked cards effect) */}
                <rect
                    x="14"
                    y="12"
                    width="28"
                    height="4"
                    rx="2"
                    fill="white"
                    fillOpacity="0.6"
                />
                <rect
                    x="18"
                    y="8"
                    width="20"
                    height="4"
                    rx="2"
                    fill="white"
                    fillOpacity="0.4"
                />

                {/* Notification dot */}
                <circle
                    cx="44"
                    cy="14"
                    r="6"
                    fill="#EF4444"
                    stroke="white"
                    strokeWidth="2"
                />

                {/* Gradients */}
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#3B82F6" />
                        <stop offset="1" stopColor="#1D4ED8" />
                    </linearGradient>
                    <linearGradient id={flapGradientId} x1="10" y1="19" x2="46" y2="31" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#3B82F6" />
                        <stop offset="1" stopColor="#1D4ED8" />
                    </linearGradient>
                </defs>
            </svg>

            {showText && (
                <span className={`font-bold text-gray-900 ${text}`}>
                    Mail<span className="text-brand-600">Deck</span>
                </span>
            )}
        </div>
    );
}

// Icon only version for favicons, app icons etc.
export function LogoIcon({ size = 32, className = '' }: { size?: number; className?: string }) {
    const uniqueId = useId();
    const gradientId = `logoIconGradient-${uniqueId}`;
    const flapGradientId = `flapIconGradient-${uniqueId}`;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 56 56"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Background rounded square */}
            <rect
                width="56"
                height="56"
                rx="12"
                fill={`url(#${gradientId})`}
            />

            {/* Mail envelope body */}
            <rect
                x="10"
                y="16"
                width="36"
                height="26"
                rx="3"
                fill="white"
            />

            {/* Mail envelope flap (triangle) */}
            <path
                d="M10 19L28 31L46 19"
                stroke={`url(#${flapGradientId})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />

            {/* Deck lines (stacked cards effect) */}
            <rect
                x="14"
                y="12"
                width="28"
                height="4"
                rx="2"
                fill="white"
                fillOpacity="0.6"
            />
            <rect
                x="18"
                y="8"
                width="20"
                height="4"
                rx="2"
                fill="white"
                fillOpacity="0.4"
            />

            {/* Notification dot */}
            <circle
                cx="44"
                cy="14"
                r="6"
                fill="#EF4444"
                stroke="white"
                strokeWidth="2"
            />

            {/* Gradients */}
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#1D4ED8" />
                </linearGradient>
                <linearGradient id={flapGradientId} x1="10" y1="19" x2="46" y2="31" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#1D4ED8" />
                </linearGradient>
            </defs>
        </svg>
    );
}
