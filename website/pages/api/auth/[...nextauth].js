import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { createDefaultApiKey } from '../../../lib/apiKeyUtils';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const authOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
        }),
        CredentialsProvider({
            name: 'Email',
            credentials: {
                email: { label: "Email", type: "email", placeholder: "your@email.com" },
                password: { label: "Password", type: "password" },
                isSignUp: { label: "Sign Up", type: "hidden" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email and password required');
                }

                const email = credentials.email.toLowerCase();
                const isSignUp = credentials.isSignUp === 'true';

                if (isSignUp) {
                    // Sign up flow
                    const existingUser = await prisma.user.findUnique({
                        where: { email }
                    });

                    if (existingUser) {
                        throw new Error('User already exists');
                    }

                    // Hash password
                    const passwordHash = await bcrypt.hash(credentials.password, 10);

                    // Create new user
                    const user = await prisma.user.create({
                        data: {
                            email,
                            passwordHash,
                            emailVerified: new Date() // Auto-verify for now
                        }
                    });

                    // Auto-generate API key
                    try {
                        await createDefaultApiKey(user.id);
                    } catch (error) {
                        console.error('Failed to create API key:', error);
                    }

                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        image: user.image
                    };
                } else {
                    // Sign in flow
                    const user = await prisma.user.findUnique({
                        where: { email }
                    });

                    if (!user || !user.passwordHash) {
                        throw new Error('Invalid email or password');
                    }

                    // Verify password
                    const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

                    if (!isValid) {
                        throw new Error('Invalid email or password');
                    }

                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        image: user.image
                    };
                }
            }
        })
    ],
    callbacks: {
        async signIn({ user, account, profile, isNewUser }) {
            // Auto-generate API key for new users (only for OAuth, not credentials)
            if (isNewUser && account?.provider !== 'credentials') {
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
        async session({ session, token, user }) {
            // Add user ID to session
            if (token?.sub) {
                session.user.id = token.sub;
            } else if (user?.id) {
                session.user.id = user.id;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
            }
            return token;
        }
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    session: {
        strategy: 'jwt', // Changed to JWT to support credentials provider
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);
