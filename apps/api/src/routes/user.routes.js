import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createAuthenticate, requireRoles } from '../middleware/authenticate.js';
import { PASSWORD_HASH_OPTIONS } from '../security/passwords.js';
import { createPaginationSchema, paginationMeta, parsePagination } from '../utils/pagination.js';

const listSchema = createPaginationSchema({
  role: z.enum(['admin', 'instructor', 'learner']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  search: z.string().trim().min(2).max(100).optional(),
});

const createInstructorSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
}).strict();

const updateUserSchema = z.object({
  role: z.enum(['admin', 'learner', 'instructor']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

function validateBody(schema) {
  return function bodyValidation(request, response, next) {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      sendError(response, 400, 'INVALID_REQUEST', 'Request body is invalid');
      return;
    }
    request.validatedBody = result.data;
    next();
  };
}

function parseId(value, response) {
  if (!/^[a-f\d]{24}$/i.test(value)) {
    sendError(response, 400, 'INVALID_ID', 'Account identifier is invalid');
    return undefined;
  }
  return new mongoose.Types.ObjectId(value);
}

function accountSummary(user) {
  return {
    id: String(user._id),
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    mfaEnabled: Boolean(user.mfaEnabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createUserRouter({
  userModel,
  courseModel,
  isDatabaseReady,
  cookieName,
  cookieClearOptions,
}) {
  const router = Router();
  const requireUser = createAuthenticate({ userModel, isDatabaseReady, cookieName, cookieClearOptions });

  router.use(requireUser, requireRoles('admin'));

  router.post('/instructors', validateBody(createInstructorSchema), async (request, response, next) => {
    try {
      const temporaryPassword = randomBytes(24).toString('base64url');
      const passwordHash = await argon2.hash(temporaryPassword, PASSWORD_HASH_OPTIONS);
      const instructor = await userModel.create({
        ...request.validatedBody,
        passwordHash,
        role: 'instructor',
        status: 'active',
        mustChangePassword: true,
      });
      console.info('Instructor account provisioned', {
        actorId: String(request.authenticatedUser._id),
        subjectId: String(instructor._id),
      });
      response.set('Cache-Control', 'no-store');
      response.status(201).json({
        user: accountSummary(instructor),
        temporaryPassword,
      });
    } catch (error) {
      if (error?.code === 11000) {
        sendError(response, 409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists');
        return;
      }
      next(error);
    }
  });

  router.get('/', async (request, response, next) => {
    try {
      const pagination = parsePagination(request.query, response, listSchema);
      if (!pagination) return;
      const filter = {};
      if (pagination.role) filter.role = pagination.role;
      if (pagination.status) filter.status = pagination.status;
      if (pagination.search) {
        const search = new RegExp(escapeRegex(pagination.search), 'i');
        filter.$or = [{ displayName: search }, { email: search }];
      }
      const [users, total] = await Promise.all([
        userModel.find(filter)
          .select('_id displayName email role status mustChangePassword mfaEnabled createdAt updatedAt')
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean(),
        userModel.countDocuments(filter),
      ]);
      response.set('Cache-Control', 'private, no-store');
      response.status(200).json({
        items: users.map(accountSummary),
        pagination: paginationMeta(pagination, total),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:userId/reset-password', async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId, response);
      if (!userId) return;
      const target = await userModel.findById(userId).select('_id role status mustChangePassword');
      if (!target) {
        sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Account was not found');
        return;
      }
      if (target.role === 'admin') {
        sendError(response, 409, 'ADMIN_ACCOUNT_PROTECTED', 'Administrator passwords cannot be reset through this operation');
        return;
      }
      if (target.status !== 'active') {
        sendError(response, 409, 'ACCOUNT_DISABLED', 'Reactivate the account before resetting its password');
        return;
      }

      const temporaryPassword = randomBytes(24).toString('base64url');
      const passwordHash = await argon2.hash(temporaryPassword, PASSWORD_HASH_OPTIONS);
      const updatedUser = await userModel.findOneAndUpdate(
        { _id: userId, role: { $ne: 'admin' }, status: 'active' },
        {
          $set: { passwordHash, mustChangePassword: true },
          $inc: { sessionVersion: 1 },
        },
        { new: true, runValidators: true },
      ).select('_id displayName email role status mustChangePassword mfaEnabled createdAt updatedAt').lean();
      if (!updatedUser) {
        sendError(response, 409, 'ACCOUNT_CHANGED', 'Account changed while this reset was being processed');
        return;
      }

      console.info('Account password reset by administrator', {
        actorId: String(request.authenticatedUser._id),
        subjectId: String(updatedUser._id),
      });
      response.set('Cache-Control', 'no-store');
      response.status(200).json({
        user: accountSummary(updatedUser),
        temporaryPassword,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:userId/reset-mfa', async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId, response);
      if (!userId) return;
      if (String(userId) === String(request.authenticatedUser._id)) {
        sendError(response, 409, 'SELF_MFA_RESET_NOT_ALLOWED', 'Ask another administrator to reset your MFA');
        return;
      }
      const target = await userModel.findById(userId).select('_id role mfaEnabled');
      if (!target || target.role !== 'admin') {
        sendError(response, 404, 'ADMIN_ACCOUNT_NOT_FOUND', 'Administrator account was not found');
        return;
      }
      if (!target.mfaEnabled) {
        sendError(response, 409, 'MFA_NOT_CONFIGURED', 'MFA is not enabled for this account');
        return;
      }
      const updatedUser = await userModel.findOneAndUpdate(
        { _id: userId, role: 'admin', mfaEnabled: true },
        {
          $set: { mfaEnabled: false, mfaRecoveryCodeHashes: [] },
          $unset: {
            mfaSecretEncrypted: 1,
            mfaPendingSecretEncrypted: 1,
            mfaLastUsedStep: 1,
          },
          $inc: { sessionVersion: 1 },
        },
        { new: true, runValidators: true },
      ).select('_id displayName email role status mustChangePassword mfaEnabled createdAt updatedAt').lean();
      if (!updatedUser) {
        sendError(response, 409, 'ACCOUNT_CHANGED', 'Account changed while MFA reset was being processed');
        return;
      }
      console.warn('Administrator MFA reset by another administrator', {
        actorId: String(request.authenticatedUser._id),
        subjectId: String(updatedUser._id),
      });
      response.set('Cache-Control', 'private, no-store');
      response.status(200).json({ user: accountSummary(updatedUser) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:userId', validateBody(updateUserSchema), async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId, response);
      if (!userId) return;
      const target = await userModel.findById(userId).select('_id role status mustChangePassword');
      if (!target) {
        sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Account was not found');
        return;
      }
      if (target.role === 'admin') {
        sendError(response, 409, 'ADMIN_ACCOUNT_PROTECTED', 'Administrator accounts cannot be changed through this operation');
        return;
      }

      const updates = request.validatedBody;
      const resultingStatus = updates.status ?? target.status;
      if (updates.role === 'admin' && target.mustChangePassword) {
        sendError(response, 409, 'PASSWORD_CHANGE_PENDING', 'The account must change its temporary password before administrator access can be granted');
        return;
      }
      if (updates.role === 'admin' && resultingStatus !== 'active') {
        sendError(response, 422, 'ADMIN_MUST_BE_ACTIVE', 'An administrator account must be active when promoted');
        return;
      }
      const removesInstructorAccess = target.role === 'instructor'
        && ((updates.role !== undefined && updates.role !== 'instructor')
          || (updates.status === 'disabled' && target.status === 'active'));
      if (removesInstructorAccess && await courseModel.exists({
        instructorId: userId,
        status: { $ne: 'archived' },
      })) {
        sendError(response, 409, 'INSTRUCTOR_HAS_COURSES', 'Archive or reassign this instructor’s courses before changing account access');
        return;
      }

      const updatedUser = await userModel.findOneAndUpdate(
        { _id: userId, role: { $ne: 'admin' } },
        { $set: updates, $inc: { sessionVersion: 1 } },
        { new: true, runValidators: true },
      ).select('_id displayName email role status mustChangePassword mfaEnabled createdAt updatedAt').lean();
      if (!updatedUser) {
        sendError(response, 409, 'ACCOUNT_CHANGED', 'Account changed while this update was being processed');
        return;
      }

      console.info('Account updated by administrator', {
        actorId: String(request.authenticatedUser._id),
        subjectId: String(updatedUser._id),
        previousRole: target.role,
        role: updatedUser.role,
        previousStatus: target.status,
        status: updatedUser.status,
      });
      response.set('Cache-Control', 'private, no-store');
      response.status(200).json({ user: accountSummary(updatedUser) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
