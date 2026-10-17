#!/usr/bin/env node
// This CLI never imports production storage credentials. It talks only to the
// authenticated, approval-gated website endpoint; preview is the default.
import { readFile } from 'node:fs/promises';

const [action = 'preview', campaignFile, ...args] = process.argv.slice(2);
const flag = (name) => args.indexOf(name) < 0 ? undefined : args[args.indexOf(name) + 1];
if (!['preview', 'test', 'approve', 'send', 'status'].includes(action) || !campaignFile) {
  console.error('Usage: node scripts/email-launch.mjs preview|test|approve|send|status campaign.json [--preview preview.json] [--approval "APPROVE ..."] [--to configured-test-address]');
  process.exit(1);
}
if (!process.env.EMAIL_ADMIN_SECRET) throw new Error('Set EMAIL_ADMIN_SECRET in the local process environment; never pass it in flags or commit it.');
const campaign = JSON.parse(await readFile(campaignFile, 'utf8'));
let payload = { action, campaign, campaignId: campaign.id };
if (action === 'test') {
  if (!flag('--to')) throw new Error('Explicit --to is required and must match a configured, confirmed test recipient.');
  payload.email = flag('--to');
}
if (action === 'approve' || action === 'send') {
  if (!flag('--preview') || !flag('--approval')) throw new Error('Review a saved preview, then explicitly supply its --preview file and --approval text.');
  const preview = JSON.parse(await readFile(flag('--preview'), 'utf8'));
  if (flag('--approval') !== preview.approval) throw new Error('Approval must exactly match the reviewed preview.');
  payload = { ...payload, contentDigest: preview.contentDigest, audienceDigest: preview.audienceDigest, approval: flag('--approval'), campaignId: campaign.id, limit: 3 };
}
const response = await fetch('https://www.a305x.com/api/launch', {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.EMAIL_ADMIN_SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload), signal: AbortSignal.timeout(60000),
});
const data = await response.json();
if (!response.ok) { console.error(data.error || 'Request failed'); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
