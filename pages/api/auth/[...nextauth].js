import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '../../../lib/prisma';
import { createDefaultApiKey } from '../../../lib/apiKeyUtils';

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            // SECURITY: Prevent account takeover attacks. When true, attackers can create
            // a Google account with a victim's email and automatically take over their account.
            // Email verification should be required before linking accounts.
            allowDangerousEmailAccountLinking: false,
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code"
                }
            }
        })
    ],
    callbacks: {
        async signIn({ user, account, profile, isNewUser }) {
            try {
                console.log('Sign-in attempt:', {
                    email: user?.email,
                    isNewUser,
                    provider: account?.provider
                });

                // Auto-generate API key for new users
                if (isNewUser) {
                    try {
                        await createDefaultApiKey(user.id);
                        console.log(`Auto-generated API key for new user: ${user.email}`);
                    } catch (error) {
                        console.error(`Failed to auto-generate API key for ${user.email}:`, error);
                        // Don't block signup if key generation fails
                    }
                }
                return true;
            } catch (error) {
                console.error('SignIn callback error:', error);
                // Still allow sign-in to prevent redirect loop
                return true;
            }
        },
        async session({ session, user }) {
            try {
                // Add user ID to session
                if (user && user.id) {
                    session.user.id = user.id;
                }
                return session;
            } catch (error) {
                console.error('Session callback error:', error);
                // Return session even if error to avoid auth loop
                return session;
            }
        },
        async redirect({ url, baseUrl }) {
            try {
                console.log('Redirect:', { url, baseUrl });
                // Allows relative callback URLs
                if (url.startsWith("/")) return `${baseUrl}${url}`;
                // Allows callback URLs on the same origin
                else if (new URL(url).origin === baseUrl) return url;
                return baseUrl + "/dashboard";
            } catch (error) {
                console.error('Redirect callback error:', error);
                return baseUrl + "/dashboard";
            }
        }
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    session: {
        strategy: 'database',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);
