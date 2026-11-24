import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('App Configuration and Production Fail-Fast Contract', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails fast when running in production environment without DATABASE_URL', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['DATABASE_URL'];

    expect(() => loadConfig()).toThrow(
      /DATABASE_URL is strictly required when running in production environment/
    );
  });

  it('succeeds in production when DATABASE_URL is configured', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DATABASE_URL'] = 'postgresql://arrival:arrival@localhost:5432/arrival_prod';

    const config = loadConfig();
    expect(config.environment).toBe('production');
    expect(config.databaseUrl).toBe('postgresql://arrival:arrival@localhost:5432/arrival_prod');
  });

  it('allows development and test environments to start with default fallback', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['DATABASE_URL'];

    const config = loadConfig();
    expect(config.environment).toBe('test');
    expect(config.databaseUrl).toBeUndefined();
  });
});
