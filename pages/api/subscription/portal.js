// pages/api/subscription/portal.js
import Stripe from 'stripe';
import prisma from '../../../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Find user's Stripe customer ID
        const user = await prisma.user.findUnique({
            where: { email },
            select: { stripeCustomerId: true }
        });

        if (!user?.stripeCustomerId) {
            return res.status(404).json({
                error: 'No billing account found',
                message: 'You do not have an active subscription'
            });
        }

        // Create Stripe billing portal session
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.NEXTAUTH_URL || 'https://kamiyo.ai'}/dashboard/subscription`,
        });

        return res.status(200).json({ url: session.url });

    } catch (error) {
        console.error('Billing portal error:', error);
        return res.status(500).json({
            error: 'Failed to create billing portal session',
            message: error.message
        });
    }
}
