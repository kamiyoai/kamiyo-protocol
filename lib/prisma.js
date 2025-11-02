// lib/prisma.js
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['query', 'info', 'warn', 'error'], // Log all queries and errors for debugging
    datasources: {
        db: {
            url: process.env.DATABASE_URL, // e.g., postgresql://kamiyo_ai_user:PASSWORD@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai?sslmode=require
        },
    },
    // Explicitly configure engine options (remove redundant connectionString)
    __internal: {
        engine: {
            connectionLimit: 20, // Match pool size
            connectTimeout: 10000, // Timeout set to 10 seconds (adjust if needed)
            ssl: {
                rejectUnauthorized: true, // Enforce certificate validation (Render provides a valid cert)
                // Note: If connection issues persist, consider setting rejectUnauthorized: false for testing or adding ca: process.env.RENDER_PG_SSL_CA
            },
        },
    },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
