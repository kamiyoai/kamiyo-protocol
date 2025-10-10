// pages/api/watchlists/[id].js
import { getServerSession } from 'next-auth/next';
import authOptions from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const watchlist = await prisma.watchlist.findFirst({
    where: { id, userId: user.id }
  });

  if (!watchlist) {
    return res.status(404).json({ error: 'Watchlist not found' });
  }

  if (req.method === 'DELETE') {
    await prisma.watchlist.delete({ where: { id } });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
