import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginInput } from '@mb/shared';
import type { SessionUser } from '../app';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = LoginInput.parse(req.body);
    const user = await app.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
      return reply.code(401).send({ error: 'invalid_credentials' });
    const session: SessionUser = { id: user.id, email: user.email, role: user.role, personId: user.personId };
    const token = app.jwt.sign(session, { expiresIn: '30d' });
    reply.setCookie('mb_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 3600,
    });
    return session;
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('mb_session', { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: app.requireRole() }, async (req) => req.user);
}
