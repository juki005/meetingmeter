import path from 'path';
import fs from 'fs';
import express from 'express';
import { fileURLToPath } from 'url';
import app from './app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Serve frontend in production if built
const clientDist = path.resolve(__dirname, '../../dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`⚡ MeetingMeter Server running on http://localhost:${PORT}`);
});

export default server;
