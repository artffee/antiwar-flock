import { equal } from './_lib/email-tokens.js';
import { emailReady } from './_lib/email-provider.js';
import { previewCampaign, approveCampaign, sendCampaign, testCampaign, campaignStatus } from './_lib/campaigns.js';
import { headers, bodyJson } from './_lib/email-http.js';

export default async function handler(req, res) {
  headers(res);
  if (!process.env.EMAIL_ADMIN_SECRET || process.env.EMAIL_ADMIN_SECRET.length < 32 || !equal(req.headers.authorization, `Bearer ${process.env.EMAIL_ADMIN_SECRET}`)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST' });
  }
  try {
    const body = bodyJson(req);
    if (body.action === 'preview') {
      const { keys, ...preview } = await previewCampaign(body.campaign);
      return res.status(200).json({ ...preview, sendingConfigured: emailReady(true) });
    }
    if (body.action === 'approve') return res.status(200).json(await approveCampaign(body));
    if (body.action === 'send') return res.status(200).json(await sendCampaign(body));
    if (body.action === 'test') return res.status(200).json(await testCampaign(body));
    if (body.action === 'status') return res.status(200).json(await campaignStatus(body.campaignId));
    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    const expected = /campaign|configured|approval|preview|recipient|confirm|request|JSON/i.test(error.message);
    return res.status(expected ? 400 : 503).json({ error: expected ? error.message : 'Private email storage is unavailable; nothing further was sent.' });
  }
}
