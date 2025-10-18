import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { createDefaultApiKey } from '../../../lib/apiKeyUtils';

const prisma = new PrismaClient();

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
            // Auto-generate API key for new users
            if (isNewUser) {
                try {
                    await createDefaultApiKey(user.id);
                    console.log(`✅ Auto-generated API key for new user: ${user.email}`);
                } catch (error) {
                    console.error(`❌ Failed to auto-generate API key for ${user.email}:`, error);
                    // Don't block signup if key generation fails
                }
            }
            return true;
        },
        async session({ session, user }) {
            // Add user ID to session
            session.user.id = user.id;
            return session;
        },
        async redirect({ url, baseUrl }) {
            // Allows relative callback URLs
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            // Allows callback URLs on the same origin
            else if (new URL(url).origin === baseUrl) return url;
            return baseUrl + "/dashboard";
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
