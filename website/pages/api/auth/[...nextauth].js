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
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
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
    debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);
