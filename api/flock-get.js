import { loadFlock } from './_lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = String(req.query.id || '');
  const flock = await loadFlock(id);

  if (!flock) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(flock);
}
