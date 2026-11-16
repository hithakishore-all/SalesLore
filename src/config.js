// Configuration from environment variables, with checks that say exactly what is missing.
import 'dotenv/config';

export const SETUP_DOCS = {
  db: 'docs/SETUP_POSTGRES.md (step 3: create the app user)',
  slack: 'docs/SETUP_SLACK.md (step 4: copy the tokens into .env)',
  model: 'README.md#configuration (MODEL and ANTHROPIC_API_KEY)',
};

export function loadConfig(argv = process.argv, env = process.env) {
  const offline = argv.includes('--offline') || env.SALESLORE_OFFLINE === '1';
  const cfg = {
    offline,
    host: env.SALESLORE_HOST || '127.0.0.1',
    port: Number(env.PORT || env.SALESLORE_PORT || 3000),
    databaseUrl: env.DATABASE_URL || '',
    model: (env.MODEL || 'scripted').toLowerCase(),
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    slackBotToken: env.SLACK_BOT_TOKEN || '',
    slackAppToken: env.SLACK_APP_TOKEN || '',
    slackUserMap: parseUserMap(env.SALESLORE_SLACK_USER_MAP || ''),
    noSlack: argv.includes('--no-slack'),
  };
  return cfg;
}

// "U01ABC=dana,U02DEF=leo" -> { U01ABC: 'dana', U02DEF: 'leo' }
export function parseUserMap(s) {
  const out = {};
  for (const pair of s.split(',').map(x => x.trim()).filter(Boolean)) {
    const [slackId, sellerId] = pair.split('=').map(x => x.trim());
    if (slackId && sellerId) out[slackId] = sellerId;
  }
  return out;
}

// Returns a list of problems, each with the fix. Empty list = ready.
export function checkConfig(cfg) {
  const problems = [];
  if (!cfg.offline && !cfg.databaseUrl) {
    problems.push({ what: 'DATABASE_URL is not set, so live mode cannot reach Postgres.', fix: `Set it in .env (see ${SETUP_DOCS.db}), or run offline with: npm run offline` });
  }
  if (cfg.databaseUrl && !/^postgres(ql)?:\/\//.test(cfg.databaseUrl)) {
    problems.push({ what: 'DATABASE_URL must start with postgres:// or postgresql://.', fix: `Fix the value in .env (see ${SETUP_DOCS.db}).` });
  }
  if (!['scripted', 'anthropic'].includes(cfg.model)) {
    problems.push({ what: `MODEL="${cfg.model}" is not supported. Use "scripted" or "anthropic".`, fix: `See ${SETUP_DOCS.model}.` });
  }
  if (cfg.model === 'anthropic' && !cfg.anthropicKey) {
    problems.push({ what: 'MODEL=anthropic needs ANTHROPIC_API_KEY.', fix: `Add the key to .env, or set MODEL=scripted (see ${SETUP_DOCS.model}).` });
  }
  return problems;
}

export function slackStatus(cfg) {
  if (cfg.noSlack) return { enabled: false, reason: 'Slack disabled with --no-slack.' };
  const missing = [];
  if (!cfg.slackBotToken) missing.push('SLACK_BOT_TOKEN');
  if (!cfg.slackAppToken) missing.push('SLACK_APP_TOKEN');
  if (missing.length) return { enabled: false, reason: `Slack bot off: ${missing.join(' and ')} not set. See ${SETUP_DOCS.slack}.` };
  if (!cfg.slackBotToken.startsWith('xoxb-')) return { enabled: false, reason: `SLACK_BOT_TOKEN should start with xoxb-. See ${SETUP_DOCS.slack}.` };
  if (!cfg.slackAppToken.startsWith('xapp-')) return { enabled: false, reason: `SLACK_APP_TOKEN should start with xapp-. See ${SETUP_DOCS.slack}.` };
  return { enabled: true, reason: 'Slack bot on (Socket Mode).' };
}
