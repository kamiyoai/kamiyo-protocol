import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '../../../lib/prisma';
import bcrypt from 'bcryptjs';

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
        }),
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                try {
                    // Validate input
                    if (!credentials?.email || !credentials?.password) {
                        console.log('Missing email or password');
                        return null;
                    }

                    // Find user by email
                    const user = await prisma.user.findUnique({
                        where: { email: credentials.email.toLowerCase() }
                    });

                    // Generic error message to prevent user enumeration
                    if (!user || !user.passwordHash) {
                        console.log('User not found or no password set');
                        return null;
                    }

                    // Verify password
                    const isPasswordValid = await bcrypt.compare(
                        credentials.password,
                        user.passwordHash
                    );

                    if (!isPasswordValid) {
                        console.log('Invalid password');
                        return null;
                    }

                    // Return user object (without password)
                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        image: user.image
                    };
                } catch (error) {
                    console.error('Authorization error:', error);
                    return null;
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
                return true;
            } catch (error) {
                console.error('SignIn callback error:', error);
                return true;
            }
        },
        async session({ session, token }) {
            try {
                // Add user ID to session from JWT token
                if (token && token.sub) {
                    session.user.id = token.sub;
                }
                return session;
            } catch (error) {
                console.error('Session callback error:', error);
                // Return session even if error to avoid auth loop
                return session;
            }
        },
        async jwt({ token, user }) {
            try {
                // Add user ID to token on sign in
                if (user) {
                    token.id = user.id;
                }
                return token;
            } catch (error) {
                console.error('JWT callback error:', error);
                return token;
            }
        },
        async redirect({ url, baseUrl }) {
            try {
                // Don't redirect for internal NextAuth endpoints (_log, etc)
                if (url.includes('/api/auth/_')) {
                    return baseUrl;
                }

                // Allows relative callback URLs
                if (url.startsWith("/")) return `${baseUrl}${url}`;

                // Allows callback URLs on the same origin (handle different ports in dev)
                try {
                    const urlObj = new URL(url);
                    const baseUrlObj = new URL(baseUrl);
                    // Same origin including port
                    if (urlObj.origin === baseUrlObj.origin) {
                        return url;
                    }
                    // Same hostname (different port is ok in dev)
                    if (urlObj.hostname === baseUrlObj.hostname) {
                        // Rewrite to correct port
                        urlObj.port = baseUrlObj.port;
                        return urlObj.toString();
                    }
                } catch (e) {
                    // Not a valid URL, continue
                }

                return baseUrl;
            } catch (error) {
                console.error('Redirect callback error:', error);
                return baseUrl;
            }
        }
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    session: {
        strategy: 'jwt', // Changed to JWT for compatibility with CredentialsProvider
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: false, // Disabled to prevent infinite _log request loop
};

export default NextAuth(authOptions);
