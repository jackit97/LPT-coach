---
description: "Deploy the Cloudflare Worker backend (lpt-worker) to production"
agent: agent
---
Deploy the Cloudflare Worker backend for this project:

1. Run in a terminal (sync mode): `cd 'c:\Users\Giacomo\LPT coach\LPT-coach\worker'; npx wrangler deploy`
2. Wait for it to complete and read the output.
3. Report back: the deployed Worker URL, the Version ID, and whether it succeeded or failed.
4. If it fails, show the exact error from the output — do not retry blindly or guess secrets (e.g. never re-enter `DATABASE_URL`/`JWT_SECRET` yourself if prompted, tell the user to do it).
