import { useRouter } from 'next/router';
import Head from 'next/head';

export default function AuthError() {
    const router = useRouter();
    const { error } = router.query;

    const errorMessages = {
        Configuration: 'There is a problem with the server configuration.',
        AccessDenied: 'Access denied. You do not have permission to sign in.',
        Verification: 'The verification token has expired or has already been used.',
        Default: 'An error occurred during authentication.',
    };

    const errorMessage = errorMessages[error] || errorMessages.Default;

    return (
        <>
            <Head>
                <title>Authentication Error - KAMIYO</title>
            </Head>
            <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
                <div className="max-w-md w-full space-y-6 p-8 border border-red-500 border-opacity-25 rounded-lg">
                    <div className="text-center">
                        <h2 className="text-2xl font-light mb-2">Authentication Error</h2>
                        <p className="text-gray-400">{errorMessage}</p>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={() => router.push('/auth/signin')}
                            className="w-full px-6 py-3 bg-cyan hover:bg-cyan/80 text-black rounded-lg transition font-medium"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => router.push('/')}
                            className="w-full px-6 py-3 bg-transparent border border-gray-500 border-opacity-25 hover:border-gray-400 rounded-lg transition"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
