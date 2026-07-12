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
