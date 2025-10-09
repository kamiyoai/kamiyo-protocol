// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import prisma from "../../../lib/prisma";

async function findOrCreateGoogleUser(user) {
    const email = user?.email;
    if (!email) return null;

    try {
        // Find existing user by email
        let dbUser = await prisma.user.findUnique({
            where: { email },
            include: { subscriptions: true }, // Optional: Include subscriptions if needed for status
        });

        // If no user exists, create one
        if (!dbUser) {
            dbUser = await prisma.user.create({
                data: {
                    email,
                    subscriptionStatus: "free", // Default status per schema
                    // passwordHash remains null since Google auth doesn't use it
                },
            });
        }

        return dbUser;
    } catch (error) {
        console.error("Error in findOrCreateGoogleUser:", error.message, error.stack);
        return null;
    }
}

export default NextAuth({
    secret: process.env.NEXTAUTH_SECRET,

    session: {
        strategy: "jwt",
    },

    pages: {
        signIn: "/auth/signin",
    },

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: { prompt: "consent", access_type: "offline", response_type: "code" },
            },
        }),
    ],

    callbacks: {
        async signIn({ user }) {
            try {
                const dbUser = await findOrCreateGoogleUser(user);
                if (!dbUser) {
                    console.warn("Sign-in failed: User not found or created");
                    return false;
                }

                user.id = dbUser.id;
                user.subscriptionStatus = dbUser.subscriptionStatus;

                return true;
            } catch (error) {
                console.error("Error in signIn callback:", error.message, error.stack);
                return false;
            }
        },

        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.email = user.email;
                token.subscriptionStatus = user.subscriptionStatus;
            }
            return token;
        },

        async session({ session, token }) {
            if (token) {
                session.user = {
                    id: token.id,
                    name: token.name,
                    email: token.email,
                    image: token.picture,
                    subscriptionStatus: token.subscriptionStatus,
                };
            }
            return session;
        },

        async redirect({ url, baseUrl }) {
            const parsedUrl = new URL(url, baseUrl);
            let callbackUrl = parsedUrl.searchParams.get("callbackUrl");

            if (callbackUrl && callbackUrl.startsWith(baseUrl)) {
                console.log("Redirecting to callbackUrl:", callbackUrl);
                return callbackUrl;
            }

            if (parsedUrl.searchParams.has("session_id")) {
                const redirectUrl = `${baseUrl}/kami/summon${parsedUrl.search}`;
                console.log("Redirecting from Stripe payment:", redirectUrl);
                return redirectUrl;
            }

            console.log("Default redirect to /kami/summon");
            return `${baseUrl}/kami/summon`;
        },
    },
});