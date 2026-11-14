import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { apiRoutes } from './routes.js';
import { ensurePhoenixDir, loadConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getPublicDir(): string {
  // In dev / production, check possible locations for dist/public
  const candidates = [
    path.resolve(__dirname, 'public'),
    path.resolve(__dirname, '../public'),
    path.resolve(__dirname, '../../dist/public'),
    path.resolve(process.cwd(), 'dist/public'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  // Fallback to closest dist/public
  return path.resolve(__dirname, '../public');
}

export function isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, host);
  });
}

export async function findAvailablePort(startPort = 3000, host = '127.0.0.1'): Promise<number> {
  let port = startPort;
  while (!(await isPortAvailable(port, host))) {
    port++;
    if (port > startPort + 50) {
      throw new Error(`Could not find an available port in range ${startPort}-${port}`);
    }
  }
  return port;
}

export async function createServer(): Promise<FastifyInstance> {
  ensurePhoenixDir();
  loadConfig();
  const app = Fastify({
    logger: false,
    bodyLimit: 25 * 1024 * 1024, // 25 MB for multimodal base64 attachments
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB max per file
      files: 20,
    },
  });

  // Register API routes
  await app.register(apiRoutes);

  // Serve static files if public dir exists
  const publicDir = getPublicDir();
  if (fs.existsSync(publicDir)) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
    });

    // SPA fallback: send index.html for non-API client routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        reply.status(404).send({ error: 'Endpoint not found' });
      } else {
        const indexPath = path.join(publicDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          reply.sendFile('index.html');
        } else {
          reply.status(404).send({ error: 'Web UI assets not built yet. Run `npm run build`.' });
        }
      }
    });
  }

  return app;
}

export interface ServerInstance {
  server: FastifyInstance;
  port: number;
  host: string;
  url: string;
}

export async function startServer(preferredPort = 3000, host = '127.0.0.1'): Promise<ServerInstance> {
  const port = await findAvailablePort(preferredPort, host);
  const app = await createServer();

  await app.listen({ port, host });
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  console.log(`Сервер запущен на порту ${port} (${url})`);

  return {
    server: app,
    port,
    host,
    url,
  };
}
