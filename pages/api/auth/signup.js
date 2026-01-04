import prisma from '../../../lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * Signup API endpoint
 * Creates a new user with email/password authentication
 *
 * Security measures:
 * - Password hashed with bcrypt (12 rounds)
 * - Email validation
 * - Password strength requirements
 * - Generic error messages to prevent user enumeration
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password, name } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Invalid email format'
            });
        }

        // Validate password strength (minimum 8 characters)
        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long'
            });
        }

        // Additional password requirements (optional but recommended)
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);

        if (!hasUpperCase || !hasLowerCase || !hasNumber) {
            return res.status(400).json({
                error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
            });
        }

        // Normalize email (lowercase)
        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (existingUser) {
            // Generic error message to prevent user enumeration
            return res.status(400).json({
                error: 'Unable to create account. Please try a different email.'
            });
        }

        // Hash password with bcrypt (12 rounds for security)
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user in database
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                name: name || null,
                passwordHash,
                emailVerified: null
            }
        });

        // Return success (without sensitive data)
        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });

    } catch (error) {
        console.error('Signup error:', error);

        // Generic error message for security
        return res.status(500).json({
            error: 'Unable to create account. Please try again later.'
        });
    }
}
