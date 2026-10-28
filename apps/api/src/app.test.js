import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp({
  NODE_ENV: 'test',
  CLIENT_ORIGINS: ['http://localhost:5173'],
});

describe('API foundation', () => {
  it('reports liveness without exposing internal configuration', async () => {
    const response = await request(app).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'educloud-api' });
    expect(response.body).not.toHaveProperty('databaseUrl');
  });

  it('returns the standard error shape for unknown routes', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found',
    });
  });

  it('does not grant CORS access to an unlisted browser origin', async () => {
    const response = await request(app)
      .get('/api/v1/health/live')
      .set('Origin', 'https://untrusted.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
