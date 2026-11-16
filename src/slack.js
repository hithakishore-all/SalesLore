// SalesLore Companion in Slack (Bolt, Socket Mode: no public URL needed).
import bolt from '@slack/bolt';
import { answer } from './companion.js';
import { runAgents, approve, SalesLoreError } from './engine/agents.js';
import { matchAccount } from './companion.js';

const { App, LogLevel } = bolt;

export function renderAnswer(out) {
  const body = out.lines.map(l => `• ${l.text}${l.evidence_id ? `  \`${l.evidence_id}\`` : ''}${l.step ? `  _${l.step}_` : ''}`).join('\n');
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${out.title}*\n${body}` } },
  ];
  const ctx = [];
  if (out.footer) ctx.push(out.footer);
  if (out.account) ctx.push(out.approved ? 'Brief approved by the transfer owner.' : 'Brief not yet approved; treat as a draft.');
  if (ctx.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: ctx.join('  ·  ') }] });
  return { text: `${out.title}\n${out.lines.map(l => l.text).join('\n')}`, blocks };
}

export const HELP = [
  '*SalesLore Companion*',
  '`/saleslore brief <account>`  the inherited account brief',
  '`/saleslore next <account>`  what Maya would do next',
  '`/saleslore ask <question>`  e.g. who decides at Halcyon?',
  '`/saleslore run <account>`  run the agents (approval stays owner-only)',
].join('\n');

export function startSlack({ store, cfg }) {
  const app = new App({ token: cfg.slackBotToken, appToken: cfg.slackAppToken, socketMode: true, logLevel: LogLevel.WARN });

  async function sellerFor(slackUserId) {
    const id = cfg.slackUserMap[slackUserId];
    if (!id) return null;
    return (await store.sellers()).find(s => s.seller_id === id) || null;
  }

  app.command('/saleslore', async ({ command, ack, respond }) => {
    await ack();
    const text = (command.text || '').trim();
    const [verb, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    try {
      if (!verb || verb === 'help') return respond({ response_type: 'ephemeral', text: HELP });
      if (verb === 'run') {
        const accounts = await store.accounts();
        const acct = matchAccount(accounts, arg);
        if (!acct) return respond({ response_type: 'ephemeral', text: `I could not find "${arg}". Try one of: ${accounts.map(a => a.name).join(', ')}.` });
        const who = await sellerFor(command.user_id);
        if (!who) return respond({ response_type: 'ephemeral', text: 'Your Slack user is not mapped to a SalesLore user. Add it to SALESLORE_SLACK_USER_MAP in .env (see docs/SETUP_SLACK.md).' });
        const run = await runAgents(store, cfg, acct.account_id, who);
        const log = run.log.map(l => `${l.kind === 'fail' ? ':x:' : ':white_check_mark:'} *${l.stage}*  ${l.text}`).join('\n');
        const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*Agents ran on ${acct.name}*\n${log}` } }];
        if (run.status === 'validated') {
          blocks.push({ type: 'actions', elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Approve brief' }, action_id: 'saleslore_approve', value: run.run_id }] });
          blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Only the transfer owner can approve. Approving sends nothing to the customer.' }] });
        }
        return respond({ response_type: 'in_channel', text: `Agents ran on ${acct.name}: ${run.status}`, blocks });
      }
      const question = verb === 'brief' ? `brief ${arg}` : verb === 'next' ? `next steps ${arg}` : verb === 'ask' ? arg : text;
      return respond({ response_type: 'in_channel', ...renderAnswer(await answer(store, cfg, question)) });
    } catch (err) {
      const msg = err instanceof SalesLoreError ? err.message : 'Something went wrong. Check the server log.';
      if (!(err instanceof SalesLoreError)) console.error('[slack]', err);
      return respond({ response_type: 'ephemeral', text: msg });
    }
  });

  app.action('saleslore_approve', async ({ ack, body, respond }) => {
    await ack();
    try {
      const who = await sellerFor(body.user.id);
      const { created, approval } = await approve(store, body.actions[0].value, who || { seller_id: null, name: `Slack user ${body.user.id}` });
      await respond({ response_type: 'in_channel', replace_original: false, text: created ? `:white_check_mark: Brief approved by ${approval.approved_by}. Nothing was sent to the customer.` : `Already approved by ${approval.approved_by}. Nothing changed.` });
    } catch (err) {
      await respond({ response_type: 'ephemeral', replace_original: false, text: err instanceof SalesLoreError ? err.message : 'Approval failed. Check the server log.' });
    }
  });

  app.event('app_mention', async ({ event, say }) => {
    const q = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    await say({ thread_ts: event.ts, ...renderAnswer(await answer(store, cfg, q)) });
  });

  return app.start().then(() => app);
}
