import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { env: { DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://mb:mb@localhost:5432/mb' } } });
