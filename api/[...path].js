import serverless from 'serverless-http';

let appHandler;

async function getAppHandler() {
  if (!appHandler) {
    const { app } = await import('../server.js');
    appHandler = serverless(app);
  }

  return appHandler;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://drizn.com https://*.supabase.co wss://*.supabase.co; frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors 'self';");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const url = req.url || '';

  if (url === '/api/health' || url === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'drizn-api',
      runtime: 'vercel',
      persistence: 'supabase',
      timestamp: new Date().toISOString(),
    });
  }

  if (url === '/api/persistence' || url === '/persistence') {
    return sendJson(res, 200, {
      mode: 'supabase',
      backend: 'vercel-serverless',
      liveListings: true,
      uploads: true,
      timestamp: new Date().toISOString(),
    });
  }

  const routeHandler = await getAppHandler();
  return routeHandler(req, res);
}
