import { serve } from '@hono/node-server';
import app from './index.js';

const port = Number(process.env.PORT || 3001);

serve({
  fetch: (request) => app.fetch(request, process.env),
  port,
});

console.log(`LPT Coach API listening on port ${port}`);