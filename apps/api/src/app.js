import cors from 'cors';
import { randomBytes } from 'node:crypto';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { loadConfig } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { csrfProtection } from './middleware/csrf.js';
import { SESSION_DURATION_MS } from './middleware/authenticate.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCourseRouter } from './routes/course.routes.js';
import { createEnrollmentRouter } from './routes/enrollment.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import { createLearningRouter } from './routes/learning.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createUserModel } from './models/user.model.js';
import { createCourseModel } from './models/course.model.js';
import { createEnrollmentModel } from './models/enrollment.model.js';
import { createAssignmentModel } from './models/assignment.model.js';
import { createSubmissionModel } from './models/submission.model.js';
import mongoose from 'mongoose';

export function createApp(config = loadConfig(), {
  sessionStore,
  rateLimitStore,
  userModel = createUserModel(),
  courseModel = createCourseModel(),
  enrollmentModel = createEnrollmentModel(),
  assignmentModel = createAssignmentModel(),
  submissionModel = createSubmissionModel(),
  isDatabaseReady = () => mongoose.connection.readyState === 1,
} = {}) {
  if (config.NODE_ENV === 'production' && (
    !sessionStore
    || !rateLimitStore?.login
    || !rateLimitStore?.registration
    || !rateLimitStore?.csrf
    || !rateLimitStore?.courseWrite
    || !rateLimitStore?.enrollment
    || !rateLimitStore?.userWrite
    || !rateLimitStore?.userRead
    || !rateLimitStore?.changePassword
    || !rateLimitStore?.mfa
    || !rateLimitStore?.submissionWrite
    || !rateLimitStore?.dashboardRead
  )) {
    throw new Error('Production requires persistent session and rate-limit stores');
  }

  const app = express();
  const allowedOrigins = new Set(config.CLIENT_ORIGINS);
  const cookieName = config.NODE_ENV === 'production' ? '__Host-educloud.sid' : 'educloud.sid';
  const cookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS,
  };
  const cookieClearOptions = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
  };

  if (config.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', config.TRUST_PROXY_HOPS);
  }

  app.disable('x-powered-by');
  app.use(helmet({
    // Local HTTP development should not set a long-lived HSTS policy in the browser.
    strictTransportSecurity: config.NODE_ENV === 'production' ? undefined : false,
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 600,
  }));
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(session({
    name: cookieName,
    secret: config.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    proxy: config.TRUST_PROXY_HOPS > 0,
    cookie: cookieOptions,
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore ? { store: rateLimitStore.login } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      });
    },
  });
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore ? { store: rateLimitStore.registration } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      });
    },
  });
  const csrfSessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore ? { store: rateLimitStore.csrf } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      });
    },
  });
  const courseWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    skip(request) {
      return !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.courseWrite ? { store: rateLimitStore.courseWrite } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many course changes. Try again later.' },
      });
    },
  });
  const enrollmentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    skip(request) {
      return request.method !== 'POST';
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.enrollment ? { store: rateLimitStore.enrollment } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many enrollment attempts. Try again later.' },
      });
    },
  });
  const accountWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    skip(request) {
      return !['POST', 'PATCH', 'DELETE'].includes(request.method);
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.userWrite ? { store: rateLimitStore.userWrite } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many account changes. Try again later.' },
      });
    },
  });
  const accountReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    skip(request) {
      return request.method !== 'GET';
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.userRead ? { store: rateLimitStore.userRead } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many account list requests. Try again later.' },
      });
    },
  });
  const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.changePassword ? { store: rateLimitStore.changePassword } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many password change attempts. Try again later.' },
      });
    },
  });
  const mfaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator(request) {
      return request.session?.userId
        ? `account:${request.session.userId}`
        : `ip:${ipKeyGenerator(request.ip)}`;
    },
    skip(request) {
      return request.method !== 'POST';
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.mfa ? { store: rateLimitStore.mfa } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many multi-factor attempts. Try again later.' },
      });
    },
  });
  const submissionWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    skip(request) {
      return request.method === 'GET';
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.submissionWrite ? { store: rateLimitStore.submissionWrite } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many learning activity changes. Try again later.' },
      });
    },
  });
  const dashboardReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(rateLimitStore?.dashboardRead ? { store: rateLimitStore.dashboardRead } : {}),
    handler(_request, response) {
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many dashboard requests. Try again later.' },
      });
    },
  });

  app.use('/api/v1/auth/login', loginLimiter);
  app.use('/api/v1/auth/register', registrationLimiter);
  app.use('/api/v1/auth/csrf', csrfSessionLimiter);
  app.use('/api/v1/auth/change-password', passwordChangeLimiter);
  app.use('/api/v1/auth/mfa', mfaLimiter);
  app.use('/api/v1/assignments', submissionWriteLimiter);
  app.use('/api/v1/submissions', submissionWriteLimiter);
  app.use('/api/v1/dashboard', dashboardReadLimiter);
  app.use('/api/v1/courses', courseWriteLimiter);
  app.use('/api/v1/courses/:courseId/enrollments', enrollmentLimiter);
  app.use('/api/v1/users', accountReadLimiter);
  app.use('/api/v1/users', accountWriteLimiter);
  app.use('/api/v1', csrfProtection(allowedOrigins));

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter({
    userModel,
    isDatabaseReady,
    cookieName,
    cookieClearOptions,
    mfaEncryptionKey: config.MFA_ENCRYPTION_KEY,
  }));
  const courseDependencies = {
    userModel,
    courseModel,
    enrollmentModel,
    isDatabaseReady,
    cookieName,
    cookieClearOptions,
  };
  app.use('/api/v1/courses', createCourseRouter(courseDependencies));
  app.use('/api/v1/enrollments', createEnrollmentRouter(courseDependencies));
  app.use('/api/v1/users', createUserRouter({
    userModel,
    courseModel,
    isDatabaseReady,
    cookieName,
    cookieClearOptions,
  }));
  app.use('/api/v1', createLearningRouter({
    userModel,
    courseModel,
    enrollmentModel,
    assignmentModel,
    submissionModel,
    isDatabaseReady,
    cookieName,
    cookieClearOptions,
  }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
