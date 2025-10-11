# Database Setup Notes

## Development Environment

The development environment uses **SQLite** for simplicity:
- Database file: `./prisma/dev.db`
- Connection string: `DATABASE_URL="file:./dev.db"`
- Prisma schema provider: `sqlite`

## Production Environment

**IMPORTANT**: Production uses **PostgreSQL**, not SQLite.

### Switching to Production

When deploying to production, you need to:

1. **Update Prisma schema** (`prisma/schema.prisma`):
   ```prisma
   datasource db {
     provider = "postgresql"  // Change from "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. **Update DATABASE_URL** in production `.env`:
   ```bash
   DATABASE_URL=postgresql://username:password@host:5432/kamiyo
   ```

3. **Run migrations**:
   ```bash
   npx prisma migrate deploy
   ```

## Enterprise User

The following enterprise tier user has been created in development:
- Email: `admin@kamiyo.ai`
- Tier: `enterprise`
- Status: `active`

This user will need to be recreated in production after deployment.
