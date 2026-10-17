#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { confirmationEmail, launchEmail } from '../api/_lib/email-templates.js';

const output = resolve(process.argv[2] || 'docs/email-previews');
await mkdir(output, { recursive: true });
const links = { unsubscribe: 'https://www.a305x.com/email#unsubscribe=PREVIEW_ONLY', preferences: 'https://www.a305x.com/email#preferences=PREVIEW_ONLY' };
const previews = {
  confirmation: confirmationEmail('https://www.a305x.com/email#confirm=PREVIEW_ONLY', links),
  launch: launchEmail({ title: 'Wear the noise.', message: 'PREVIEW — this is sample copy, not a launch announcement.\nA new transmission from Miami. Independent art. Rebellious minds. Your next good distraction.', path: '/store' }, links, 'PREVIEW — owner-approved business mailing address required'),
};
for (const [name, email] of Object.entries(previews)) {
  await writeFile(resolve(output, `${name}.html`), email.html);
  await writeFile(resolve(output, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`);
}
console.log(`Saved non-deliverable email previews to ${output}`);
