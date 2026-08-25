import { getFlockCount } from './_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const count = await getFlockCount();
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    res.status(200).json({ count });
  } catch {
    res.status(200).json({ count: 0 });
  }
}
