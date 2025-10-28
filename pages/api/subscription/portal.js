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
        // For now, billing portal is not implemented
        // Stripe customer IDs need to be added to User model first
        return res.status(501).json({
            error: 'Not implemented',
            message: 'Stripe billing portal integration is coming soon. Please contact support for billing changes.'
        });
    } catch (error) {
        console.error('Billing portal error:', error);
        return res.status(500).json({
            error: 'Failed to create billing portal session',
            message: error.message
        });
    }
}
