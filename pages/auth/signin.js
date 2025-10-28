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
                <div className="max-w-md w-full space-y-8 p-8 border border-gray-500 border-opacity-25 rounded-lg">
                    <div>
                        <h2 className="text-3xl font-light text-center mb-2">Sign in to KAMIYO</h2>
                        <p className="text-gray-400 text-center text-sm">
                            Access x402 payment platform for AI agents
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
                                    className="w-full px-4 py-2 bg-black border border-gray-500 border-opacity-25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
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
                                    className="w-full px-4 py-2 bg-black border border-gray-500 border-opacity-25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
                                    placeholder="Enter your password"
                                    disabled={loading}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full px-6 py-3 bg-cyan text-black rounded-lg hover:bg-opacity-80 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Signing in...' : 'Sign in'}
                            </button>
                        </form>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-500 border-opacity-25"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-black text-gray-500">or</span>
                            </div>
                        </div>

                        {/* Google Sign In */}
                        <div className="flex justify-center w-full -ml-8">
                            <ScrambleButton
                                text="Continue with Google"
                                enabled={!loading}
                                onClick={() => signIn('google', { callbackUrl: callbackUrl || '/dashboard' })}
                            />
                        </div>

                        <div className="text-center">
                            <button
                                onClick={() => router.push('/auth/signup')}
                                className="text-gray-400 hover:text-cyan transition-colors text-sm"
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
