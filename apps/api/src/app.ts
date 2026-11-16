import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fstatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { authRoutes } from './routes/auth';
import { masterDataRoutes } from './routes/masterdata';
import { eventRoutes } from './routes/events';
import { planningRoutes } from './routes/planning';

export type Role = 'ADMIN' | 'DISPATCHER' | 'TEAM_LEAD' | 'MEMBER';
export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  personId: string | null;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: SessionUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
    requireRole: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function buildApp(opts: { db?: PrismaClient; logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  const db = opts.db ?? new PrismaClient();
  app.decorate('db', db);
  app.addHook('onClose', async () => db.$disconnect());

  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret',
    cookie: { cookieName: 'mb_session', signed: false },
  });

  app.decorate('requireRole', (...roles: Role[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (roles.length && !roles.includes(req.user.role)) return reply.code(403).send({ error: 'forbidden' });
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation', issues: err.issues });
    const code = (err as { code?: string }).code;
    if (code === 'P2025') return reply.code(404).send({ error: 'not_found' });
    if (code === 'P2002') return reply.code(409).send({ error: 'duplicate' });
    app.log.error(err);
    return reply.code(err.statusCode ?? 500).send({ error: err.message });
  });

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(masterDataRoutes, { prefix: '/api' });
  await app.register(eventRoutes, { prefix: '/api' });
  await app.register(planningRoutes, { prefix: '/api' });
  app.get('/api/health', async () => ({ ok: true }));

  // Serve built web client in production.
  const webDist = resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fstatic, { root: webDist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api') ? reply.code(404).send({ error: 'not_found' }) : reply.sendFile('index.html'),
    );
  }

  return app;
}
