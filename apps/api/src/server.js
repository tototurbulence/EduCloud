import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { SESSION_DURATION_MS } from './middleware/authenticate.js';
import { MongoRateLimitStore } from './middleware/mongo-rate-limit-store.js';
import { createUserModel } from './models/user.model.js';
import { createCourseModel } from './models/course.model.js';
import { createEnrollmentModel } from './models/enrollment.model.js';
import { createAssignmentModel } from './models/assignment.model.js';
import { createSubmissionModel } from './models/submission.model.js';

const SESSION_TTL_SECONDS = SESSION_DURATION_MS / 1000;
const config = loadConfig();
let server;
let isShuttingDown = false;

async function start() {
  let sessionStore;
  let rateLimitStore;
  let userModel = createUserModel();
  const courseModel = createCourseModel();
  const enrollmentModel = createEnrollmentModel();
  const assignmentModel = createAssignmentModel();
  const submissionModel = createSubmissionModel();

  if (config.MONGODB_URI) {
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
    });
    await Promise.all([
      userModel.init(),
      courseModel.init(),
      enrollmentModel.init(),
      assignmentModel.init(),
      submissionModel.init(),
    ]);

    const clientPromise = Promise.resolve(mongoose.connection.getClient());
    sessionStore = MongoStore.create({
      clientPromise,
      dbName: mongoose.connection.name,
      collectionName: 'sessions',
      ttl: SESSION_TTL_SECONDS,
      autoRemove: 'native',
    });

    const counters = mongoose.connection.db.collection('rateLimitCounters');
    rateLimitStore = {
      login: new MongoRateLimitStore(counters, {
        prefix: 'login',
        secret: config.SESSION_SECRET,
      }),
      registration: new MongoRateLimitStore(counters, {
        prefix: 'registration',
        secret: config.SESSION_SECRET,
      }),
      csrf: new MongoRateLimitStore(counters, {
        prefix: 'csrf',
        secret: config.SESSION_SECRET,
      }),
      courseWrite: new MongoRateLimitStore(counters, {
        prefix: 'course-write',
        secret: config.SESSION_SECRET,
      }),
      enrollment: new MongoRateLimitStore(counters, {
        prefix: 'enrollment',
        secret: config.SESSION_SECRET,
      }),
      userWrite: new MongoRateLimitStore(counters, {
        prefix: 'user-write',
        secret: config.SESSION_SECRET,
      }),
      userRead: new MongoRateLimitStore(counters, {
        prefix: 'user-read',
        secret: config.SESSION_SECRET,
      }),
      changePassword: new MongoRateLimitStore(counters, {
        prefix: 'change-password',
        secret: config.SESSION_SECRET,
      }),
      mfa: new MongoRateLimitStore(counters, {
        prefix: 'mfa',
        secret: config.SESSION_SECRET,
      }),
      submissionWrite: new MongoRateLimitStore(counters, {
        prefix: 'submission-write',
        secret: config.SESSION_SECRET,
      }),
      dashboardRead: new MongoRateLimitStore(counters, {
        prefix: 'dashboard-read',
        secret: config.SESSION_SECRET,
      }),
    };
    await Promise.all([
      rateLimitStore.login.createIndexes(),
      rateLimitStore.registration.createIndexes(),
      rateLimitStore.csrf.createIndexes(),
      rateLimitStore.courseWrite.createIndexes(),
      rateLimitStore.enrollment.createIndexes(),
      rateLimitStore.userWrite.createIndexes(),
      rateLimitStore.userRead.createIndexes(),
      rateLimitStore.changePassword.createIndexes(),
      rateLimitStore.mfa.createIndexes(),
      rateLimitStore.submissionWrite.createIndexes(),
      rateLimitStore.dashboardRead.createIndexes(),
    ]);
  }

  const app = createApp(config, {
    sessionStore,
    rateLimitStore,
    userModel,
    courseModel,
    enrollmentModel,
    assignmentModel,
    submissionModel,
  });
  const host = config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  server = app.listen(config.PORT, host, () => {
    console.info(`EduCloud API listening on port ${config.PORT}`);
  });
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.info(`Received ${signal}; shutting down API`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await mongoose.disconnect();
  } catch {
    console.error('API shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch(async (error) => {
  // Error messages from drivers may contain connection details. Log only a
  // stable category and code; never print URIs or credentials.
  console.error('API startup failed', {
    name: error?.name ?? 'Error',
    code: typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : undefined,
  });
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
