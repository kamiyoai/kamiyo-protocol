import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../../components/ScrambleButton';
import { useState } from 'react';

export default function SignIn() {
    const router = useRouter();
    const { callbackUrl } = router.query;
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleEmailAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                isSignUp: isSignUp.toString(),
                redirect: false,
                callbackUrl: callbackUrl || '/dashboard'
            });

            if (result?.error) {
                setError(result.error);
                setLoading(false);
            } else if (result?.ok) {
                router.push(callbackUrl || '/dashboard');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>{isSignUp ? 'Sign Up' : 'Sign In'} - KAMIYO</title>
            </Head>
            <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
                <div className="max-w-md w-full space-y-6 p-8 border border-gray-500 border-opacity-25 rounded-lg">
                    <div>
                        <h2 className="text-3xl font-light text-center mb-2">
                            {isSignUp ? 'Create Account' : 'Sign in to KAMIYO'}
                        </h2>
                        <p className="text-gray-400 text-center text-sm">
                            Access blockchain exploit intelligence
                        </p>
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleEmailAuth} className="space-y-4">
                        <div>
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-black border border-gray-500 border-opacity-25 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan transition-colors"
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                className="w-full px-4 py-3 bg-black border border-gray-500 border-opacity-25 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan transition-colors"
                            />
                            {isSignUp && (
                                <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
                            )}
                        </div>

                        {error && (
                            <div className="text-red-500 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-center">
                            <ScrambleButton
                                text={loading ? 'Loading...' : (isSignUp ? 'Create Account' : 'Sign In')}
                                loading={loading}
                                onClick={handleEmailAuth}
                                type="submit"
                            />
                        </div>

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSignUp(!isSignUp);
                                    setError('');
                                }}
                                className="text-cyan hover:text-magenta transition-colors text-sm"
                            >
                                {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
                            </button>
                        </div>
                    </form>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-500 border-opacity-25"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-black text-gray-500">Or continue with</span>
                        </div>
                    </div>

                    {/* Google OAuth */}
                    <div className="flex justify-center -ml-8">
                        <ScrambleButton
                            text="Google"
                            loading={loading}
                            onClick={() => {
                                setLoading(true);
                                signIn('google', { callbackUrl: callbackUrl || '/dashboard' });
                            }}
                        />
                    </div>

                    <div className="text-center text-sm text-gray-500">
                        By signing {isSignUp ? 'up' : 'in'}, you agree to our Terms of Service and Privacy Policy
                    </div>

                    <div className="text-center">
                        <button
                            onClick={() => router.push('/')}
                            className="text-cyan hover:text-magenta transition-colors text-sm"
                        >
                            ← Back to home
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
