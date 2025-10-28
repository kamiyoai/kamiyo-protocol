import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import { ScrambleButton } from '../../components/ScrambleButton';

export default function SignUp() {
    const router = useRouter();
    const { callbackUrl } = router.query;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState('');

    const validatePasswordStrength = (pwd) => {
        if (pwd.length === 0) {
            setPasswordStrength('');
            return;
        }

        if (pwd.length < 8) {
            setPasswordStrength('Too short');
            return;
        }

        const hasUpperCase = /[A-Z]/.test(pwd);
        const hasLowerCase = /[a-z]/.test(pwd);
        const hasNumber = /[0-9]/.test(pwd);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);

        const strengthCount = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar].filter(Boolean).length;

        if (strengthCount === 4 && pwd.length >= 12) {
            setPasswordStrength('Strong');
        } else if (strengthCount >= 3 && pwd.length >= 8) {
            setPasswordStrength('Medium');
        } else {
            setPasswordStrength('Weak');
        }
    };

    const handlePasswordChange = (e) => {
        const pwd = e.target.value;
        setPassword(pwd);
        validatePasswordStrength(pwd);
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setError('');

        // Validate passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        // Validate password strength
        if (password.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }

        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);

        if (!hasUpperCase || !hasLowerCase || !hasNumber) {
            setError('Password must contain uppercase, lowercase, and number');
            return;
        }

        setLoading(true);

        try {
            // Call signup API
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    name: name || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to create account');
                setLoading(false);
                return;
            }

            // Auto sign in after successful signup
            const signInResult = await signIn('credentials', {
                redirect: false,
                email,
                password,
            });

            if (signInResult?.error) {
                // Signup succeeded but sign in failed - redirect to signin
                router.push('/auth/signin?message=Account created. Please sign in.');
            } else {
                // Success - redirect to dashboard or callback URL
                router.push(callbackUrl || '/dashboard');
            }
        } catch (error) {
            console.error('Sign up error:', error);
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const getPasswordStrengthColor = () => {
        switch (passwordStrength) {
            case 'Strong': return 'text-green-500';
            case 'Medium': return 'text-yellow-500';
            case 'Weak': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    return (
        <>
            <Head>
                <title>Sign Up - KAMIYO</title>
            </Head>
            <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
                <div className="max-w-md w-full space-y-8 p-8 border border-gray-500 border-opacity-25 rounded-lg">
                    <div>
                        <h2 className="text-3xl font-light text-center mb-2">Join KAMIYO</h2>
                        <p className="text-gray-400 text-center text-sm">
                            Create an account to access x402 payment platform
                        </p>
                    </div>

                    <div className="space-y-4">
                        {/* Email/Password Sign Up Form */}
                        <form onSubmit={handleSignUp} className="space-y-4">
                            {error && (
                                <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-2 rounded text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                                    Name (Optional)
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-2 bg-black border border-gray-500 border-opacity-25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
                                    placeholder="Your name"
                                    disabled={loading}
                                />
                            </div>

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
                                    onChange={handlePasswordChange}
                                    required
                                    className="w-full px-4 py-2 bg-black border border-gray-500 border-opacity-25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
                                    placeholder="At least 8 characters"
                                    disabled={loading}
                                />
                                {passwordStrength && (
                                    <p className={`text-xs mt-1 ${getPasswordStrengthColor()}`}>
                                        Strength: {passwordStrength}
                                    </p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                    Must include uppercase, lowercase, and number
                                </p>
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="w-full px-4 py-2 bg-black border border-gray-500 border-opacity-25 rounded-lg focus:outline-none focus:border-cyan transition text-white"
                                    placeholder="Confirm your password"
                                    disabled={loading}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full px-6 py-3 bg-cyan text-black rounded-lg hover:bg-opacity-80 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Creating account...' : 'Create Account'}
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

                        {/* Google Sign Up */}
                        <div className="flex justify-center w-full -ml-8">
                            <ScrambleButton
                                text="Sign up with Google"
                                enabled={!loading}
                                onClick={() => signIn('google', { callbackUrl: callbackUrl || '/dashboard' })}
                            />
                        </div>

                        <div className="text-center">
                            <button
                                onClick={() => router.push('/auth/signin')}
                                className="text-gray-400 hover:text-cyan transition-colors text-sm"
                            >
                                Already have an account? <span className="text-cyan">Sign in</span>
                            </button>
                        </div>

                        <div className="text-center text-sm text-gray-500">
                            By signing up, you agree to our Terms of Service and Privacy Policy
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
