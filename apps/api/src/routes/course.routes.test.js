import argon2 from 'argon2';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { PASSWORD_HASH_OPTIONS } from '../security/passwords.js';

const password = 'Correct-Horse-42!';
let passwordHash;

beforeAll(async () => {
  passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
});

function createUserModel(role) {
  const user = {
    _id: '000000000000000000000001',
    displayName: 'Utilisateur Test',
    email: 'user@example.test',
    passwordHash,
    role,
    status: 'active',
    mustChangePassword: false,
    sessionVersion: 0,
    mfaEnabled: false,
  };

  return {
    findOne: () => ({ select: async () => user }),
    findById: () => ({ select: () => ({ lean: async () => user }) }),
  };
}

function createTestApp({ role, courseModel, enrollmentModel = {} }) {
  return createApp({
    NODE_ENV: 'test',
    CLIENT_ORIGINS: ['http://localhost:5173'],
  }, {
    userModel: createUserModel(role),
    courseModel,
    enrollmentModel,
    isDatabaseReady: () => true,
  });
}

async function signIn(browser) {
  const csrfToken = (await browser.get('/api/v1/auth/csrf')).body.csrfToken;
  const response = await browser.post('/api/v1/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ email: 'user@example.test', password });
  expect(response.status).toBe(200);
  return response.body.csrfToken;
}

describe('course permissions', () => {
  it('creates a draft owned by the authenticated instructor', async () => {
    const courseModel = {
      create: vi.fn(async (course) => ({
        ...course,
        _id: '000000000000000000000010',
        createdAt: new Date('2026-10-20T00:00:00.000Z'),
        updatedAt: new Date('2026-10-20T00:00:00.000Z'),
      })),
    };
    const app = createTestApp({ role: 'instructor', courseModel });
    const browser = request.agent(app);
    const csrfToken = await signIn(browser);

    const response = await browser.post('/api/v1/courses')
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Cours de démonstration' });

    expect(response.status).toBe(201);
    expect(response.body.course).toMatchObject({
      title: 'Cours de démonstration',
      status: 'draft',
      moduleCount: 0,
    });
    expect(courseModel.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Cours de démonstration',
      instructorId: '000000000000000000000001',
      status: 'draft',
      modules: [],
    }));
  });

  it('does not expose a draft course to a learner who is not its instructor', async () => {
    const courseModel = {
      findById: vi.fn(() => ({
        populate: async () => ({
          _id: '000000000000000000000010',
          title: 'Cours privé',
          description: 'Contenu réservé',
          instructorId: '000000000000000000000002',
          status: 'draft',
          modules: [{ title: 'Module privé' }],
        }),
      })),
    };
    const app = createTestApp({ role: 'learner', courseModel });
    const browser = request.agent(app);
    await signIn(browser);

    const response = await browser.get('/api/v1/courses/000000000000000000000010/content');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('COURSE_NOT_FOUND');
    expect(response.body).not.toHaveProperty('course');
  });
});
