import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { initSchema, seedInitialData } from './server/db.ts';
import { verifyOriginOnCookieMutation } from './server/auth.ts';
import { apiRouter } from './server/routes.ts';
import { runBackgroundLogisticsSweep } from './server/services.ts';

async function startServer() {
  initSchema();
  seedInitialData();
  runBackgroundLogisticsSweep();

  // Periodic sweep every 60 seconds for 15-min manual assignment escalation & 24h/1h IST reminders
  setInterval(runBackgroundLogisticsSweep, 60_000);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', verifyOriginOnCookieMutation);
  app.use('/api', apiRouter);

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ScrapEase server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ScrapEase server:', err);
  process.exit(1);
});
