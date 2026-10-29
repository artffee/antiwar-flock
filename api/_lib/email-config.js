// A separate release must review and remove this lock. Environment variables
// alone cannot activate campaign approval, test messages, or bulk delivery.
export const CAMPAIGNS_RELEASED = false;

export function siteOrigin() {
  const site = new URL(process.env.EMAIL_SITE_URL || 'https://www.a305x.com');
  if (site.protocol !== 'https:' || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash) throw new Error('Invalid email site origin');
  if (process.env.VERCEL_ENV === 'preview' && ['a305x.com', 'www.a305x.com'].includes(site.hostname)) throw new Error('Preview requires its own email origin');
  return site.origin;
}

// The existing Vercel project shares its normal Blob binding with Preview.
// Email previews must explicitly supply a different store, never fall back to
// the inherited production credential or OIDC store.
export function emailStorageOptions() {
  if (process.env.VERCEL_ENV !== 'preview') return {};
  const token = process.env.EMAIL_PREVIEW_BLOB_READ_WRITE_TOKEN || '';
  const storeId = (value) => /^vercel_blob_rw_([^_]+)_/.exec(value || '')?.[1];
  if (!storeId(token) || storeId(token) === storeId(process.env.BLOB_READ_WRITE_TOKEN)) throw new Error('Isolated preview email storage is required');
  return { token };
}
