// Set EXPO_PUBLIC_API_BASE to the backend API URL for Pages and EAS builds.
// The deployed Cloudflare Worker is the backend used by this frontend.
const DEFAULT_API_BASE = 'https://lpt-worker.gc-jack1997.workers.dev';
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || DEFAULT_API_BASE;
