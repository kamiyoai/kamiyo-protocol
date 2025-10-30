import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import { ScrambleButton } from '../../components/ScrambleButton';

export default function SignIn() {
    const router = useRouter();
    const { callbackUrl } = router.query;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleEmailSignIn = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await signIn('credentials', {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                setError('Invalid email or password');
                setLoading(false);
            } else {
                // Success - redirect to dashboard or callback URL
                router.push(callbackUrl || '/dashboard');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Sign In - KAMIYO</title>
            </Head>
            <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
                <div className="max-w-md w-full space-y-8 p-8 border border-gray-500/25 rounded-lg">
                    <div>
                        <h2 className="text-3xl font-light text-center mb-2">Sign in to KAMIYO</h2>
                        <p className="text-gray-400 text-center text-sm">
                            Access security intelligence platform for AI agents
                        </p>
                    </div>

                    <div className="space-y-4">
                        {/* Email/Password Sign In Form */}
                        <form onSubmit={handleEmailSignIn} className="space-y-4">
                            {error && (
                                <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-2 rounded text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-2 bg-black border border-gray-500/25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
                                    placeholder="your@email.com"
                                    disabled={loading}
                                />
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full px-4 py-2 bg-black border border-gray-500/25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
                                    placeholder="Enter your password"
                                    disabled={loading}
                                />
                            </div>

                            <div className="flex justify-center -ml-8">
                                <ScrambleButton
                                    text={loading ? 'Signing in...' : 'Sign in with email'}
                                    enabled={!loading}
                                    onClick={handleEmailSignIn}
                                />
                            </div>
                        </form>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-500/25"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-black text-gray-500">or</span>
                            </div>
                        </div>

                        {/* Google Sign In */}
                        <div className="flex justify-center">
                            <button
                                onClick={() => signIn('google', { callbackUrl: callbackUrl || '/dashboard' })}
                                disabled={loading}
                                className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
                                </svg>
                                Continue with Google
                            </button>
                        </div>

                        <div className="text-center">
                            <button
                                onClick={() => router.push('/auth/signup')}
                                className="text-gray-400 hover:text-magenta transition-colors text-sm"
                            >
                                Don't have an account? <span className="text-cyan">Sign up</span>
                            </button>
                        </div>

                        <div className="text-center text-sm text-gray-500">
                            By signing in, you agree to our Terms of Service and Privacy Policy
                        </div>
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
