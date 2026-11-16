import bcrypt from 'bcryptjs';
import { buildApp } from './app';

const app = await buildApp({ logger: true });

// Bootstrap first admin account from environment.
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && (await app.db.user.count()) === 0) {
  await app.db.user.create({
    data: { email: ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10), role: 'ADMIN' },
  });
  app.log.info(`Created admin ${ADMIN_EMAIL}`);
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
