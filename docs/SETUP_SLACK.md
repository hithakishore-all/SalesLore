# Set up the Slack bot (optional)

The SalesLore Companion runs in Slack with Socket Mode, so it needs no public URL. It works in offline mode and live mode. Allow about 10 minutes. You need permission to install apps in a Slack workspace (a free workspace you create is fine).

## 1. Create the app from the manifest

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App > From a manifest**.
2. Pick your workspace.
3. Paste the contents of [`slack-manifest.yml`](../slack-manifest.yml) (YAML tab) and click **Create**.

The manifest sets up the `/saleslore` command, the bot scopes (`commands`, `chat:write`, `chat:write.public`, `app_mentions:read`), interactivity for the **Approve brief** button, and Socket Mode.

## 2. Install it

In the app settings, open **Install App** and click **Install to Workspace**, then **Allow**.

## 3. Create the app-level token

1. Open **Basic Information > App-Level Tokens > Generate Token and Scopes**.
2. Name it `socket`, add the scope `connections:write`, and click **Generate**.

## 4. Copy the tokens into .env

Copy each token from the Slack page and paste it into `.env` with a text editor:
```
SLACK_BOT_TOKEN=xoxb-...      # OAuth & Permissions > Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...      # the app-level token from step 3
```
On a Mac you can also copy a token, then paste it straight into the file:
```bash
echo "SLACK_BOT_TOKEN=$(pbpaste)" >> .env
```
Never share these tokens or commit `.env`.

## 5. Map your Slack user (for approvals)

Approvals are owner-only. Tell SalesLore which Slack user is which SalesLore user. Find your member ID in Slack: click your profile picture, **Profile**, the three dots, **Copy member ID**. Then in `.env`:
```
SALESLORE_SLACK_USER_MAP=U0123ABCD=dana
```
Map a second person to `leo` to test that a non-owner cannot approve.

## 6. Start and test

```bash
npm run offline     # or npm start for live mode
```
The terminal should say `Slack: connected`. In Slack, invite the bot to a channel (`/invite @SalesLore`) and try:

| Type this | Expect |
| --- | --- |
| `/saleslore help` | The command list |
| `/saleslore brief Halcyon Freight` | The brief with readiness |
| `/saleslore ask who decides at Halcyon?` | Priya Nair, Tom Reyes and Ana Cole, each with an evidence ID |
| `/saleslore next Pinecrest Bank` | A stop message: no outreach until Jan 15, 2027 |
| `/saleslore run Brightwater Health` | The agent log with one rejected claim, then **Approve brief** |
| Click **Approve brief** as the owner | "Brief approved by Dana Whitfield. Nothing was sent to the customer." |
| Click it again | "Already approved ... Nothing changed." |
| `@SalesLore what did Maya promise Lumen?` | A threaded answer with `EV-EML-0350` |

If something is off, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#slack).
