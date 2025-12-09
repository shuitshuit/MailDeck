import { useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { signInWithRedirect } from 'aws-amplify/auth';
import { Navigate } from 'react-router-dom';

export default function LoginPage() {
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    if (authStatus === 'authenticated') {
        return <Navigate to="/" replace />;
    }

    const handleSignIn = () => {
        signInWithRedirect();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md p-4">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-brand-600">MailDeck</h1>
                    <p className="text-gray-500">Sign in to your account</p>
                </div>

                <div className="bg-white p-8 rounded-lg shadow text-center">
                    <p className="mb-6 text-gray-600">Please sign in using the secure hosted login page.</p>
                    <button
                        onClick={handleSignIn}
                        className="w-full px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors"
                    >
                        Sign in with AWS
                    </button>
                </div>
            </div>
        </div>
    );
}
