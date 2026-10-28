import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { createAuthenticate, destroySession } from '../middleware/authenticate.js';
import { createCsrfToken } from '../middleware/csrf.js';
import { PASSWORD_HASH_OPTIONS } from '../security/passwords.js';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchingTotpStep,
  totpUri,
} from '../security/mfa.js';

// Unknown accounts still incur a password verification to reduce timing-based
// account discovery. The real value is generated once and never persisted.
const dummyPasswordHashPromise = argon2.hash(randomBytes(32).toString('hex'), PASSWORD_HASH_OPTIONS);

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).strict().refine((body) => body.currentPassword !== body.newPassword, 'The new password must be different');

function publicUser(user) {
  return {
    id: String(user._id),
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
    mfaEnabled: Boolean(user.mfaEnabled),
  };
}

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

function validate(schema) {
  return function validateBody(request, response, next) {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      sendError(response, 400, 'INVALID_REQUEST', 'Request body is invalid');
      return;
    }
    request.validatedBody = result.data;
    next();
  };
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => error ? reject(error) : resolve());
  });
}

async function establishSession(request, user, { mfaVerified = false } = {}) {
  await regenerateSession(request);
  request.session.userId = String(user._id);
  request.session.userSessionVersion = Number(user.sessionVersion ?? 0);
  request.session.authCreatedAt = Date.now();
  request.session.csrfToken = createCsrfToken();
  if (user.role === 'admin') {
    if (!user.mfaEnabled) request.session.mfaSetupRequired = true;
    else if (mfaVerified) request.session.mfaVerified = true;
    else request.session.mfaChallenge = true;
  }
  await saveSession(request);
  return request.session.csrfToken;
}

export function createAuthRouter({ userModel, isDatabaseReady, cookieName, cookieClearOptions, mfaEncryptionKey }) {
  const router = Router();
  const requirePasswordChangeSession = createAuthenticate({
    userModel,
    isDatabaseReady,
    cookieName,
    cookieClearOptions,
    allowPasswordChange: true,
    allowMfaSetup: true,
    allowMfaChallenge: true,
  });
  const requireMfaSetup = createAuthenticate({
    userModel, isDatabaseReady, cookieName, cookieClearOptions, allowMfaSetup: true,
  });
  const requireMfaChallenge = createAuthenticate({
    userModel, isDatabaseReady, cookieName, cookieClearOptions, allowMfaChallenge: true,
  });
  const requireAnyAuthState = createAuthenticate({
    userModel,
    isDatabaseReady,
    cookieName,
    cookieClearOptions,
    allowPasswordChange: true,
    allowMfaSetup: true,
    allowMfaChallenge: true,
  });

  function requireDatabase(_request, response, next) {
    if (!isDatabaseReady()) {
      sendError(response, 503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable');
      return;
    }
    next();
  }

  router.get('/csrf', (request, response) => {
    if (!request.session.csrfToken) request.session.csrfToken = createCsrfToken();
    response.set('Cache-Control', 'no-store');
    response.status(200).json({ csrfToken: request.session.csrfToken });
  });

  router.post('/register', requireDatabase, validate(registerSchema), async (request, response, next) => {
    try {
      const { displayName, email, password } = request.validatedBody;
      const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
      const user = await userModel.create({
        displayName,
        email,
        passwordHash,
        role: 'learner',
        status: 'active',
      });
      const csrfToken = await establishSession(request, user);
      response.status(201).json({ user: publicUser(user), csrfToken });
    } catch (error) {
      if (error?.code === 11000) {
        sendError(response, 409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists');
        return;
      }
      next(error);
    }
  });

  router.post('/login', requireDatabase, validate(loginSchema), async (request, response, next) => {
    try {
      const { email, password } = request.validatedBody;
      const user = await userModel.findOne({ email }).select('+passwordHash');
      const passwordHash = user?.passwordHash ?? await dummyPasswordHashPromise;
      const passwordMatches = await argon2.verify(passwordHash, password);

      if (!user || user.status !== 'active' || !passwordMatches) {
        sendError(response, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
        return;
      }

      const csrfToken = await establishSession(request, user);
      const authChallenge = user.role === 'admin'
        ? (user.mfaEnabled ? 'mfa' : 'mfa-setup')
        : undefined;
      response.set('Cache-Control', 'no-store');
      response.status(200).json({ user: publicUser(user), csrfToken, ...(authChallenge ? { authChallenge } : {}) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/change-password', requirePasswordChangeSession, validate(changePasswordSchema), async (request, response, next) => {
    try {
      const user = await userModel.findById(request.authenticatedUser._id).select('+passwordHash');
      if (!user || user.status !== 'active') {
        sendError(response, 401, 'UNAUTHENTICATED', 'Authentication is required');
        return;
      }
      const currentPasswordMatches = await argon2.verify(user.passwordHash, request.validatedBody.currentPassword);
      if (!currentPasswordMatches) {
        sendError(response, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
        return;
      }

      user.passwordHash = await argon2.hash(request.validatedBody.newPassword, PASSWORD_HASH_OPTIONS);
      user.mustChangePassword = false;
      user.sessionVersion = Number(user.sessionVersion ?? 0) + 1;
      await user.save();
      const csrfToken = await establishSession(request, user);
      response.set('Cache-Control', 'no-store');
      const authChallenge = user.role === 'admin'
        ? (user.mfaEnabled ? 'mfa' : 'mfa-setup')
        : undefined;
      response.status(200).json({ user: publicUser(user), csrfToken, ...(authChallenge ? { authChallenge } : {}) });
    } catch (error) {
      next(error);
    }
  });

  const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(64) }).strict();

  router.get('/mfa/setup', requireMfaSetup, async (request, response, next) => {
    try {
      if (!mfaEncryptionKey) {
        sendError(response, 503, 'MFA_UNAVAILABLE', 'MFA encryption key is not configured');
        return;
      }
      const user = await userModel.findById(request.authenticatedUser._id)
        .select('+mfaPendingSecretEncrypted');
      if (!user || user.role !== 'admin' || user.mfaEnabled) {
        sendError(response, 409, 'MFA_SETUP_NOT_AVAILABLE', 'MFA setup is not available for this account');
        return;
      }
      let secret;
      if (user.mfaPendingSecretEncrypted) {
        secret = decryptMfaSecret(user.mfaPendingSecretEncrypted, mfaEncryptionKey);
      } else {
        secret = generateTotpSecret();
        user.mfaPendingSecretEncrypted = encryptMfaSecret(secret, mfaEncryptionKey);
        await user.save();
      }
      response.set('Cache-Control', 'private, no-store');
      response.status(200).json({ secret, otpauthUrl: totpUri(secret, user.email) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/mfa/enable', requireMfaSetup, validate(mfaCodeSchema), async (request, response, next) => {
    try {
      if (!mfaEncryptionKey) {
        sendError(response, 503, 'MFA_UNAVAILABLE', 'MFA encryption key is not configured');
        return;
      }
      const user = await userModel.findById(request.authenticatedUser._id)
        .select('+mfaPendingSecretEncrypted');
      if (!user || user.role !== 'admin' || user.mfaEnabled || !user.mfaPendingSecretEncrypted) {
        sendError(response, 409, 'MFA_SETUP_NOT_AVAILABLE', 'Start MFA setup before enabling it');
        return;
      }
      const secret = decryptMfaSecret(user.mfaPendingSecretEncrypted, mfaEncryptionKey);
      const step = matchingTotpStep(secret, request.validatedBody.code);
      if (step === undefined) {
        sendError(response, 401, 'INVALID_MFA_CODE', 'The authenticator code is invalid');
        return;
      }
      const recoveryCodes = generateRecoveryCodes();
      const updatedUser = await userModel.findOneAndUpdate(
        { _id: user._id, role: 'admin', mfaEnabled: false, mfaPendingSecretEncrypted: user.mfaPendingSecretEncrypted },
        {
          $set: {
            mfaEnabled: true,
            mfaSecretEncrypted: user.mfaPendingSecretEncrypted,
            mfaRecoveryCodeHashes: recoveryCodes.map((code) => hashRecoveryCode(code, mfaEncryptionKey)),
            mfaLastUsedStep: step,
          },
          $unset: { mfaPendingSecretEncrypted: 1 },
          $inc: { sessionVersion: 1 },
        },
        { new: true, runValidators: true },
      ).select('_id displayName email role mustChangePassword mfaEnabled sessionVersion');
      if (!updatedUser) {
        sendError(response, 409, 'MFA_SETUP_CHANGED', 'MFA setup changed; start again');
        return;
      }
      const csrfToken = await establishSession(request, updatedUser, { mfaVerified: true });
      response.set('Cache-Control', 'private, no-store');
      response.status(200).json({ user: publicUser(updatedUser), csrfToken, recoveryCodes });
    } catch (error) {
      next(error);
    }
  });

  router.post('/mfa/verify', requireMfaChallenge, validate(mfaCodeSchema), async (request, response, next) => {
    try {
      if (!mfaEncryptionKey) {
        sendError(response, 503, 'MFA_UNAVAILABLE', 'MFA encryption key is not configured');
        return;
      }
      const user = await userModel.findById(request.authenticatedUser._id)
        .select('+mfaSecretEncrypted +mfaRecoveryCodeHashes +mfaLastUsedStep');
      if (!user || user.role !== 'admin' || !user.mfaEnabled || !user.mfaSecretEncrypted) {
        sendError(response, 409, 'MFA_NOT_CONFIGURED', 'MFA is not configured for this account');
        return;
      }
      const secret = decryptMfaSecret(user.mfaSecretEncrypted, mfaEncryptionKey);
      const step = matchingTotpStep(secret, request.validatedBody.code);
      let verifiedUser;
      let recoveryCodeUsed = false;
      if (step !== undefined) {
        verifiedUser = await userModel.findOneAndUpdate(
          {
            _id: user._id,
            mfaEnabled: true,
            $or: [
              { mfaLastUsedStep: { $lt: step } },
              { mfaLastUsedStep: { $exists: false } },
            ],
          },
          { $set: { mfaLastUsedStep: step } },
          { new: true },
        ).select('_id displayName email role mustChangePassword mfaEnabled sessionVersion');
      }
      if (!verifiedUser) {
        const recoveryHash = hashRecoveryCode(request.validatedBody.code, mfaEncryptionKey);
        verifiedUser = await userModel.findOneAndUpdate(
          { _id: user._id, mfaEnabled: true, mfaRecoveryCodeHashes: recoveryHash },
          { $pull: { mfaRecoveryCodeHashes: recoveryHash }, $inc: { sessionVersion: 1 } },
          { new: true },
        ).select('_id displayName email role mustChangePassword mfaEnabled sessionVersion');
        recoveryCodeUsed = Boolean(verifiedUser);
      }
      if (!verifiedUser) {
        sendError(response, 401, 'INVALID_MFA_CODE', 'The authenticator or recovery code is invalid');
        return;
      }
      const csrfToken = await establishSession(request, verifiedUser, { mfaVerified: true });
      response.set('Cache-Control', 'private, no-store');
      response.status(200).json({ user: publicUser(verifiedUser), csrfToken, recoveryCodeUsed });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', requireAnyAuthState, async (request, response, next) => {
    try {
      await destroySession(request);
      response.clearCookie(cookieName, cookieClearOptions);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAnyAuthState, (request, response) => {
    response.set('Cache-Control', 'no-store');
    const authChallenge = request.session.mfaSetupRequired
      ? 'mfa-setup'
      : request.session.mfaChallenge ? 'mfa' : undefined;
    response.status(200).json({
      user: publicUser(request.authenticatedUser),
      ...(authChallenge ? { authChallenge } : {}),
    });
  });

  return router;
}
