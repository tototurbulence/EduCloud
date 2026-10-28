import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createAuthenticate, requireRoles } from '../middleware/authenticate.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

const orderSchema = z.number().int().min(0).max(10000);
const resourceSchema = z.discriminatedUnion('type', [
  z.object({
    title: z.string().trim().min(2).max(120),
    type: z.literal('link'),
    order: orderSchema,
    url: z.string().url().max(2048).refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.username === '' && url.password === '';
      } catch {
        return false;
      }
    }),
  }).strict(),
  z.object({
    title: z.string().trim().min(2).max(120),
    type: z.literal('text'),
    order: orderSchema,
    body: z.string().max(20000),
  }).strict(),
]);

const moduleSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(5000).optional().default(''),
  order: orderSchema,
  resources: z.array(resourceSchema).max(20).optional().default([]),
}).strict().superRefine((module, context) => {
  const orders = module.resources.map((resource) => resource.order);
  if (new Set(orders).size !== orders.length) {
    context.addIssue({ code: 'custom', message: 'Resource order values must be unique', path: ['resources'] });
  }
});

const modulesSchema = z.array(moduleSchema).max(50).superRefine((modules, context) => {
  const orders = modules.map((module) => module.order);
  if (new Set(orders).size !== orders.length) {
    context.addIssue({ code: 'custom', message: 'Module order values must be unique' });
  }
});

const createCourseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(6000).optional().default(''),
  modules: modulesSchema.optional().default([]),
}).strict();

const updateCourseSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(6000).optional(),
  modules: modulesSchema.optional(),
  status: z.enum(['draft', 'published']).optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

function preventPrivateCaching(response) {
  response.set('Cache-Control', 'private, no-store');
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
    sendError(response, 400, 'INVALID_ID', 'Resource identifier is invalid');
    return undefined;
  }
  return new mongoose.Types.ObjectId(value);
}

function publicSummary(course) {
  const instructor = course.instructorId;
  return {
    id: String(course._id),
    title: course.title,
    description: course.description,
    instructor: instructor && typeof instructor === 'object'
      ? { id: String(instructor._id), displayName: instructor.displayName }
      : null,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

function managedSummary(course) {
  return {
    ...publicSummary(course),
    status: course.status,
    moduleCount: course.modules.length,
  };
}

function courseContent(course, completedModuleIds) {
  return {
    ...managedSummary(course),
    modules: [...course.modules]
      .sort((left, right) => left.order - right.order)
      .map((module) => ({
        id: String(module._id),
        title: module.title,
        description: module.description,
        order: module.order,
        ...(completedModuleIds ? { completed: completedModuleIds.has(String(module._id)) } : {}),
        resources: [...module.resources]
          .sort((left, right) => left.order - right.order)
          .map((resource) => ({
            id: String(resource._id),
            title: resource.title,
            type: resource.type,
            order: resource.order,
            ...(resource.type === 'link' ? { url: resource.url } : { body: resource.body }),
          })),
      })),
  };
}

function isOwnerOrAdmin(user, course) {
  const ownerId = course.instructorId?._id ?? course.instructorId;
  return user.role === 'admin' || (user.role === 'instructor' && String(ownerId) === String(user._id));
}

export function createCourseRouter({
  userModel,
  courseModel,
  enrollmentModel,
  isDatabaseReady,
  cookieName,
  cookieClearOptions,
}) {
  const router = Router();
  const requireUser = createAuthenticate({ userModel, isDatabaseReady, cookieName, cookieClearOptions });
  const requireInstructorOrAdmin = requireRoles('instructor', 'admin');

  function requireDatabase(_request, response, next) {
    if (!isDatabaseReady()) {
      sendError(response, 503, 'COURSES_UNAVAILABLE', 'Courses are temporarily unavailable');
      return;
    }
    next();
  }

  router.get('/', requireDatabase, async (request, response, next) => {
    try {
      const pagination = parsePagination(request.query, response);
      if (!pagination) return;
      const filter = { status: 'published' };
      const [courses, total] = await Promise.all([
        courseModel.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .populate('instructorId', 'displayName')
          .lean(),
        courseModel.countDocuments(filter),
      ]);
      response.status(200).json({
        items: courses.map(publicSummary),
        pagination: paginationMeta(pagination, total),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/mine', requireUser, requireInstructorOrAdmin, async (request, response, next) => {
    try {
      preventPrivateCaching(response);
      const pagination = parsePagination(request.query, response);
      if (!pagination) return;
      const filter = request.authenticatedUser.role === 'admin'
        ? {}
        : { instructorId: request.authenticatedUser._id };
      const [courses, total] = await Promise.all([
        courseModel.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .populate('instructorId', 'displayName')
          .lean(),
        courseModel.countDocuments(filter),
      ]);
      response.status(200).json({
        items: courses.map(managedSummary),
        pagination: paginationMeta(pagination, total),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireUser, requireRoles('instructor'), validateBody(createCourseSchema), async (request, response, next) => {
    try {
      const course = await courseModel.create({
        ...request.validatedBody,
        instructorId: request.authenticatedUser._id,
        status: 'draft',
      });
      preventPrivateCaching(response);
      response.status(201).json({
        course: {
          id: String(course._id),
          title: course.title,
          description: course.description,
          status: course.status,
          moduleCount: course.modules.length,
          instructor: {
            id: String(request.authenticatedUser._id),
            displayName: request.authenticatedUser.displayName,
          },
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:courseId/content', requireUser, async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const course = await courseModel.findById(courseId).populate('instructorId', 'displayName');
      if (!course) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }

      const user = request.authenticatedUser;
      let allowed = isOwnerOrAdmin(user, course);
      let completedModuleIds;
      if (!allowed && user.role === 'learner' && course.status === 'published') {
        const enrollment = await enrollmentModel.findOne({ learnerId: user._id, courseId, status: 'active' })
          .select('completedModuleIds')
          .lean();
        allowed = Boolean(enrollment);
        if (enrollment) completedModuleIds = new Set((enrollment.completedModuleIds ?? []).map(String));
      }
      if (!allowed) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }

      preventPrivateCaching(response);
      response.status(200).json({ course: courseContent(course, completedModuleIds) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:courseId/modules/:moduleId/completion', requireUser, requireRoles('learner'), validateBody(
    z.object({ completed: z.boolean() }).strict(),
  ), async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const moduleId = parseId(request.params.moduleId, response);
      if (!moduleId) return;
      const course = await courseModel.findOne({ _id: courseId, status: 'published' }).select('_id modules._id');
      if (!course || !course.modules.some((module) => String(module._id) === String(moduleId))) {
        sendError(response, 404, 'MODULE_NOT_FOUND', 'Module was not found');
        return;
      }
      const update = request.validatedBody.completed
        ? { $addToSet: { completedModuleIds: moduleId } }
        : { $pull: { completedModuleIds: moduleId } };
      const enrollment = await enrollmentModel.findOneAndUpdate(
        { learnerId: request.authenticatedUser._id, courseId, status: 'active' },
        update,
        { new: true },
      ).select('completedModuleIds').lean();
      if (!enrollment) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      preventPrivateCaching(response);
      response.status(200).json({
        moduleId: String(moduleId),
        completed: (enrollment.completedModuleIds ?? []).some((id) => String(id) === String(moduleId)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:courseId/enrollments', requireUser, requireInstructorOrAdmin, async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const course = await courseModel.findById(courseId).select('_id instructorId');
      if (!course || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }

      preventPrivateCaching(response);
      const pagination = parsePagination(request.query, response);
      if (!pagination) return;
      const filter = { courseId, status: 'active' };
      const [enrollments, total] = await Promise.all([
        enrollmentModel.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .populate('learnerId', 'displayName')
          .lean(),
        enrollmentModel.countDocuments(filter),
      ]);
      response.status(200).json({
        items: enrollments.map((enrollment) => ({
          id: String(enrollment._id),
          status: enrollment.status,
          enrolledAt: enrollment.createdAt,
          learner: enrollment.learnerId
            ? { id: String(enrollment.learnerId._id), displayName: enrollment.learnerId.displayName }
            : null,
        })),
        pagination: paginationMeta(pagination, total),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:courseId/enrollments', requireUser, requireRoles('learner'), async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const course = await courseModel.findOne({ _id: courseId, status: 'published' }).select('_id');
      if (!course) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      try {
        const enrollment = await enrollmentModel.create({
          learnerId: request.authenticatedUser._id,
          courseId,
          status: 'active',
        });
        preventPrivateCaching(response);
        response.status(201).json({
          enrollment: {
            id: String(enrollment._id),
            courseId: String(courseId),
            status: enrollment.status,
            enrolledAt: enrollment.createdAt,
          },
        });
      } catch (error) {
        if (error?.code === 11000) {
          sendError(response, 409, 'ALREADY_ENROLLED', 'You are already enrolled in this course');
          return;
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/:courseId', requireDatabase, async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const course = await courseModel.findOne({ _id: courseId, status: 'published' })
        .populate('instructorId', 'displayName')
        .lean();
      if (!course) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      response.status(200).json({ course: publicSummary(course) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:courseId', requireUser, requireInstructorOrAdmin, validateBody(updateCourseSchema), async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const course = await courseModel.findById(courseId);
      if (!course || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      if (course.status === 'archived') {
        sendError(response, 409, 'COURSE_ARCHIVED', 'Archived courses cannot be modified');
        return;
      }

      preventPrivateCaching(response);
      const updates = request.validatedBody;
      const nextStatus = updates.status ?? course.status;
      const nextModules = updates.modules ?? course.modules;
      if (nextStatus === 'published' && nextModules.length === 0) {
        sendError(response, 422, 'COURSE_REQUIRES_MODULE', 'A course needs at least one module before publication');
        return;
      }
      for (const [field, value] of Object.entries(updates)) course[field] = value;
      await course.save();
      await course.populate('instructorId', 'displayName');
      response.status(200).json({ course: managedSummary(course) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:courseId', requireUser, requireInstructorOrAdmin, async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response);
      if (!courseId) return;
      const course = await courseModel.findById(courseId);
      if (!course || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      if (course.status !== 'archived') {
        course.status = 'archived';
        await course.save();
      }
      preventPrivateCaching(response);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
