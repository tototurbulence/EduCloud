import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

function createInMemoryUserModel() {
  const users = new Map();
  let nextId = 1;

  return {
    create: vi.fn(async (input) => {
      const id = String(nextId++).padStart(24, '0');
      const user = {
        _id: id,
        displayName: input.displayName,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        status: input.status,
        mustChangePassword: false,
        sessionVersion: 0,
        mfaEnabled: false,
      };
      users.set(id, user);
      return user;
    }),
    findOne(filter) {
      return {
        select: async () => [...users.values()].find((user) => user.email === filter.email) ?? null,
      };
    },
    findById(id) {
      return {
        select() {
          return {
            lean: async () => users.get(String(id)) ?? null,
          };
        },
      };
    },
  };
}

const userModel = createInMemoryUserModel();
const app = createApp({
  NODE_ENV: 'test',
  CLIENT_ORIGINS: ['http://localhost:5173'],
}, {
  userModel,
  isDatabaseReady: () => true,
});

describe('authentication routes', () => {
  it('requires CSRF and only allows public registration as a learner', async () => {
    const browser = request.agent(app);
    const csrfResponse = await browser.get('/api/v1/auth/csrf');
    const csrfToken = csrfResponse.body.csrfToken;

    const missingToken = await browser.post('/api/v1/auth/register').send({
      displayName: 'Apprenant Exemple',
      email: 'learner@example.test',
      password: 'Correct-Horse-42!',
    });
    expect(missingToken.status).toBe(403);

    const attemptedEscalation = await browser.post('/api/v1/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        displayName: 'Apprenant Exemple',
        email: 'learner@example.test',
        password: 'Correct-Horse-42!',
        role: 'admin',
      });
    expect(attemptedEscalation.status).toBe(400);
    expect(userModel.create).not.toHaveBeenCalled();

    const registration = await browser.post('/api/v1/auth/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        displayName: 'Apprenant Exemple',
        email: 'Learner@Example.test',
        password: 'Correct-Horse-42!',
      });
    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({
      displayName: 'Apprenant Exemple',
      email: 'learner@example.test',
      role: 'learner',
    });
    expect(registration.body.user).not.toHaveProperty('passwordHash');
    expect(registration.body.csrfToken).toBeTruthy();

    const session = await browser.get('/api/v1/auth/me');
    expect(session.status).toBe(200);
    expect(session.body.user.id).toBe(registration.body.user.id);

    const forbiddenAdminList = await browser.get('/api/v1/users');
    expect(forbiddenAdminList.status).toBe(403);
  });

  it('normalizes email on login and returns one generic credential error', async () => {
    const browser = request.agent(app);
    const csrfToken = (await browser.get('/api/v1/auth/csrf')).body.csrfToken;

    const login = await browser.post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'LEARNER@example.test', password: 'Correct-Horse-42!' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('learner');

    const invalidLogin = await browser.post('/api/v1/auth/login')
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ email: 'unknown@example.test', password: 'Wrong-Password-42!' });
    expect(invalidLogin.status).toBe(401);
    expect(invalidLogin.body.error).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });
  });
});
