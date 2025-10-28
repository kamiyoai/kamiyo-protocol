import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../../components/ScrambleButton';

export default function SignIn() {
    const router = useRouter();
    const { callbackUrl } = router.query;

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

                    <div className="space-y-4 flex flex-col items-center justify-center">
                        <div className="flex justify-center w-full -ml-8">
                            <ScrambleButton
                                text="Continue with Google"
                                enabled={true}
                                onClick={() => signIn('google', { callbackUrl: callbackUrl || '/dashboard' })}
                            />
                        </div>

                        {/* Alternative traditional button if needed */}
                        <button
                            onClick={() => signIn('google', { callbackUrl: callbackUrl || '/dashboard' })}
                            className="hidden w-full items-center justify-center gap-3 px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition font-medium"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            Continue with Google
                        </button>

                        <div className="relative w-full">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-500 border-opacity-25"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-black text-gray-500">Quick and secure</span>
                            </div>
                        </div>

                        <div className="text-center text-sm text-gray-500 w-full">
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
