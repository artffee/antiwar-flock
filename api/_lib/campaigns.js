import { listPrivate, mutatePrivate, readPrivate } from './private-store.js';
import { INTERESTS, ORIGIN, validEmail, emailKey, hash, linksFor } from './email-tokens.js';
import { subscriber, confirmed, matchesProduct } from './subscribers.js';
import { emailReady, deliverOnce, deliveryState } from './email-provider.js';
import { launchEmail } from './email-templates.js';

export function validateCampaign(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid campaign');
  const { id, product, title, message, path } = input;
  if (!/^[a-z0-9-]{3,60}$/.test(id || '') || typeof product !== 'string' || !Object.hasOwn(INTERESTS, product) ||
    typeof title !== 'string' || !title.trim() || title.length > 100 || /[\r\n]/.test(title) ||
    typeof message !== 'string' || !message.trim() || message.length > 3000 ||
    typeof path !== 'string' || !/^\/(?:store|flying-fluck|not-my-flucking-problem|chill-pill|about)(?:#[a-z0-9-]+)?$/.test(path)) throw new Error('Invalid campaign fields');
  return { id, product, title: title.trim(), message: message.trim(), path };
}
const campaignPath = (id) => `email-campaigns/${id}.json`;
const jobPath = (id, key) => `email-sends/launch/${id}/${key}.json`;

function rendering(campaign) {
  return { from: process.env.EMAIL_FROM || '', ...launchEmail(campaign, {
    unsubscribe: `${ORIGIN}/email#unsubscribe=RECIPIENT_LINK`, preferences: `${ORIGIN}/email#preferences=RECIPIENT_LINK`,
  }, (process.env.EMAIL_POSTAL_ADDRESS || '').trim()) };
}
const contentFingerprint = (campaign) => hash(JSON.stringify({ campaign, email: rendering(campaign) }));

async function audience(product) {
  const paths = (await listPrivate('emails/')).filter((path) => /^emails\/[a-f0-9]{64}\.json$/.test(path));
  const keys = [];
  for (let offset = 0; offset < paths.length; offset += 8) {
    const group = await Promise.all(paths.slice(offset, offset + 8).map(async (path) => {
      const key = path.slice(7, -5);
      const record = await subscriber(key);
      return record && validEmail(record.email) && emailKey(record.email) === key && matchesProduct(record, product) ? key : null;
    }));
    keys.push(...group.filter(Boolean));
  }
  return keys.sort();
}
export async function previewCampaign(input) {
  const campaign = validateCampaign(input);
  const keys = await audience(campaign.product);
  const contentDigest = contentFingerprint(campaign);
  const audienceDigest = hash(keys.join(','));
  const approval = `APPROVE ${campaign.id} ${contentDigest.slice(0, 12)} ${audienceDigest.slice(0, 12)} ${keys.length}`;
  return { campaign, contentDigest, audienceDigest, recipientCount: keys.length, approval, emailPreview: rendering(campaign), keys };
}
export async function approveCampaign(body) {
  if (!emailReady(true)) throw new Error('Marketing sending is not configured');
  const preview = await previewCampaign(body.campaign);
  if (!preview.recipientCount || preview.recipientCount > 100) throw new Error('Campaign must have 1–100 confirmed recipients');
  if (body.approval !== preview.approval || body.audienceDigest !== preview.audienceDigest || body.contentDigest !== preview.contentDigest) throw new Error('Preview changed; explicit approval of the current content and audience is required');
  const { campaign, keys, contentDigest, audienceDigest, approval } = preview;
  const saved = await mutatePrivate(campaignPath(campaign.id), (old) => {
    if (old) {
      if (old.contentDigest !== contentDigest || old.audienceDigest !== audienceDigest) throw new Error('Campaign ID already used; create a new reviewed campaign');
      return;
    }
    return { campaign, keys, contentDigest, audienceDigest, approval, approvedAt: new Date().toISOString(), expiresAt: Date.now() + 24 * 3600000 };
  });
  return { approved: true, campaignId: campaign.id, recipientCount: saved.keys.length, expiresAt: saved.expiresAt };
}

export async function sendCampaign(body) {
  if (!emailReady(true)) throw new Error('Marketing sending is not configured');
  if (!/^[a-z0-9-]{3,60}$/.test(body.campaignId || '')) throw new Error('Invalid campaign ID');
  const manifest = (await readPrivate(campaignPath(body.campaignId))).value;
  if (!manifest || manifest.approval !== body.approval || manifest.expiresAt < Date.now()) throw new Error('A current, explicitly approved campaign is required');
  if (manifest.contentDigest !== contentFingerprint(manifest.campaign)) throw new Error('Campaign rendering changed; review the content and approve a new campaign ID');
  // Small, resumable batches. Repeated calls cannot expand the approved audience.
  const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(3, body.limit)) : 3;
  const results = [];
  for (const key of manifest.keys) {
    if (results.length >= limit) break;
    const path = jobPath(manifest.campaign.id, key);
    const prior = await deliveryState(path);
    if (prior && ['sent', 'failed', 'skipped', 'uncertain'].includes(prior.state)) continue;
    const record = await subscriber(key);
    const links = linksFor(key);
    const eligible = record && validEmail(record.email) && emailKey(record.email) === key && matchesProduct(record, manifest.campaign.product);
    if (!eligible) {
      await mutatePrivate(path, (old) => old?.state === 'sent' ? undefined : { ...old, state: 'skipped', reason: 'no_longer_eligible' });
      results.push({ state: 'skipped' });
      continue;
    }
    const result = await deliverOnce(path, {
      to: [record.email], ...launchEmail(manifest.campaign, links, process.env.EMAIL_POSTAL_ADDRESS.trim()),
      headers: { 'List-Unsubscribe': `<${links.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'app', value: 'a305x' }, { name: 'kind', value: 'launch' }, { name: 'campaign', value: manifest.campaign.id }],
    }, `a305x-launch-${manifest.campaign.id}-${key}`, async () => emailReady(true) && matchesProduct(await subscriber(key), manifest.campaign.product));
    results.push(result);
  }
  return { campaignId: manifest.campaign.id, approvedRecipients: manifest.keys.length, processed: results, note: 'sent means provider accepted; use signed delivery events to establish recipient-server delivery' };
}

export async function testCampaign(body) {
  if (!emailReady(true)) throw new Error('Marketing sending is not configured');
  const campaign = validateCampaign(body.campaign);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const allowlist = (process.env.EMAIL_TEST_RECIPIENTS || '').split(',').map((item) => item.trim().toLowerCase());
  if (!validEmail(email) || !allowlist.includes(email)) throw new Error('Test recipient is not on the operator allowlist');
  const key = emailKey(email);
  if (!confirmed(await subscriber(key))) throw new Error('Test recipient must confirm the address first');
  const links = linksFor(key);
  const content = launchEmail(campaign, links, process.env.EMAIL_POSTAL_ADDRESS.trim());
  return deliverOnce(`email-sends/tests/${hash(JSON.stringify(campaign))}/${key}.json`, {
    to: [email], ...content, subject: `[TEST] ${content.subject}`,
    headers: { 'List-Unsubscribe': `<${links.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'app', value: 'a305x' }, { name: 'kind', value: 'test' }],
  }, `a305x-test-${hash(JSON.stringify(campaign))}-${key}`, async () => emailReady(true) && confirmed(await subscriber(key)));
}

export async function campaignStatus(id) {
  if (!/^[a-z0-9-]{3,60}$/.test(id || '')) throw new Error('Invalid campaign ID');
  const manifest = (await readPrivate(campaignPath(id))).value;
  if (!manifest) throw new Error('Campaign has not been approved');
  const counts = { pending: 0, sending: 0, retryable: 0, accepted: 0, deliveredToMailServer: 0, failed: 0, bounced: 0, complained: 0, suppressed: 0, skipped: 0, uncertain: 0 };
  for (const key of manifest.keys) {
    const job = await deliveryState(jobPath(id, key));
    if (!job) { counts.pending++; continue; }
    if (job.state !== 'sent') { counts[job.state === 'failed' ? 'failed' : Object.hasOwn(counts, job.state) ? job.state : 'uncertain']++; continue; }
    counts.accepted++;
    if (job.providerId) {
      const event = (await readPrivate(`email-delivery/${hash(job.providerId)}/${key}.json`)).value;
      const metric = { 'email.delivered': 'deliveredToMailServer', 'email.failed': 'failed', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.suppressed': 'suppressed' }[event?.status];
      if (metric) counts[metric]++;
    }
  }
  return { campaignId: id, approvedRecipients: manifest.keys.length, counts, note: 'Acceptance and recipient-server delivery do not establish inbox placement or human receipt.' };
}
