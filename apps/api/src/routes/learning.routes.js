import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createAuthenticate, requireRoles } from '../middleware/authenticate.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

const dateInputSchema = z.string().trim().min(20).max(40)
  .refine((value) => /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)), 'A timezone-aware date is required')
  .transform((value) => new Date(value));

const createAssignmentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().min(1).max(12000),
  deadline: dateInputSchema,
  maxScore: z.number().finite().min(0).max(1000).default(100),
}).strict();

const updateAssignmentSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  instructions: z.string().trim().min(1).max(12000).optional(),
  deadline: dateInputSchema.optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const submissionSchema = z.object({
  content: z.string().trim().min(1).max(20000),
}).strict();

const gradeSchema = z.object({
  grade: z.number().finite().min(0).max(1000),
  feedback: z.string().trim().max(6000).default(''),
}).strict();

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

function noStore(response) {
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

function parseId(value, response, label = 'Resource') {
  if (!/^[a-f\d]{24}$/i.test(value)) {
    sendError(response, 400, 'INVALID_ID', `${label} identifier is invalid`);
    return undefined;
  }
  return new mongoose.Types.ObjectId(value);
}

function isOwnerOrAdmin(user, course) {
  const ownerId = course.instructorId?._id ?? course.instructorId;
  return user.role === 'admin' || (user.role === 'instructor' && String(ownerId) === String(user._id));
}

function assignmentSummary(assignment) {
  return {
    id: String(assignment._id),
    courseId: String(assignment.courseId),
    title: assignment.title,
    instructions: assignment.instructions,
    deadline: assignment.deadline,
    maxScore: assignment.maxScore,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

function submissionSummary(submission, { includeContent = false } = {}) {
  if (!submission) return null;
  return {
    id: String(submission._id),
    ...(includeContent ? { content: submission.content } : {}),
    submittedAt: submission.submittedAt ?? submission.createdAt ?? submission.updatedAt,
    graded: Boolean(submission.gradedAt),
    ...(submission.gradedAt ? {
      grade: submission.grade,
      feedback: submission.feedback,
      gradedAt: submission.gradedAt,
    } : {}),
  };
}

export function createLearningRouter({
  userModel,
  courseModel,
  enrollmentModel,
  assignmentModel,
  submissionModel,
  isDatabaseReady,
  cookieName,
  cookieClearOptions,
}) {
  const router = Router();
  const requireUser = createAuthenticate({ userModel, isDatabaseReady, cookieName, cookieClearOptions });

  router.get('/courses/:courseId/assignments', requireUser, async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response, 'Course');
      if (!courseId) return;
      const course = await courseModel.findById(courseId).select('_id instructorId status');
      const user = request.authenticatedUser;
      if (!course) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      const staffAccess = isOwnerOrAdmin(user, course);
      if (course.status === 'archived' && !staffAccess) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      let enrollment;
      if (!staffAccess && user.role === 'learner' && course.status === 'published') {
        enrollment = await enrollmentModel.findOne({ learnerId: user._id, courseId, status: 'active' })
          .select('_id')
          .lean();
      }
      if (!staffAccess && !enrollment) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      const pagination = parsePagination(request.query, response);
      if (!pagination) return;
      const [assignments, total] = await Promise.all([
        assignmentModel.find({ courseId })
          .sort({ deadline: 1, _id: 1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean(),
        assignmentModel.countDocuments({ courseId }),
      ]);
      const result = assignments.map((assignment) => ({ ...assignmentSummary(assignment), submission: null }));
      if (user.role === 'learner' && assignments.length > 0) {
        const submissions = await submissionModel.find({
          assignmentId: { $in: assignments.map((assignment) => assignment._id) },
          learnerId: user._id,
        }).lean();
        const byAssignment = new Map(submissions.map((submission) => [String(submission.assignmentId), submission]));
        for (let index = 0; index < result.length; index += 1) {
          result[index].submission = submissionSummary(byAssignment.get(result[index].id), { includeContent: true });
        }
      }
      noStore(response);
      response.status(200).json({ items: result, pagination: paginationMeta(pagination, total) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/courses/:courseId/assignments', requireUser, requireRoles('instructor', 'admin'), validateBody(createAssignmentSchema), async (request, response, next) => {
    try {
      const courseId = parseId(request.params.courseId, response, 'Course');
      if (!courseId) return;
      const course = await courseModel.findById(courseId).select('_id instructorId status');
      if (!course || course.status === 'archived' || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'COURSE_NOT_FOUND', 'Course was not found');
        return;
      }
      if (request.validatedBody.deadline <= new Date()) {
        sendError(response, 422, 'DEADLINE_MUST_BE_FUTURE', 'The assignment deadline must be in the future');
        return;
      }
      const assignment = await assignmentModel.create({
        ...request.validatedBody,
        courseId,
        createdBy: request.authenticatedUser._id,
      });
      noStore(response);
      response.status(201).json({ assignment: assignmentSummary(assignment) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/assignments/:assignmentId', requireUser, requireRoles('instructor', 'admin'), validateBody(updateAssignmentSchema), async (request, response, next) => {
    try {
      const assignmentId = parseId(request.params.assignmentId, response, 'Assignment');
      if (!assignmentId) return;
      const assignment = await assignmentModel.findById(assignmentId);
      const course = assignment
        ? await courseModel.findById(assignment.courseId).select('_id instructorId status')
        : null;
      if (!assignment || !course || course.status === 'archived' || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'ASSIGNMENT_NOT_FOUND', 'Assignment was not found');
        return;
      }
      const updates = request.validatedBody;
      if (updates.deadline && updates.deadline <= new Date()) {
        sendError(response, 422, 'DEADLINE_MUST_BE_FUTURE', 'The assignment deadline must be in the future');
        return;
      }
      Object.assign(assignment, updates);
      await assignment.save();
      noStore(response);
      response.status(200).json({ assignment: assignmentSummary(assignment) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/assignments/:assignmentId/submissions/me', requireUser, requireRoles('learner'), async (request, response, next) => {
    try {
      const assignmentId = parseId(request.params.assignmentId, response, 'Assignment');
      if (!assignmentId) return;
      const assignment = await assignmentModel.findById(assignmentId).select('_id courseId');
      const course = assignment
        ? await courseModel.findOne({ _id: assignment.courseId, status: 'published' }).select('_id')
        : null;
      if (!assignment || !course || !await enrollmentModel.exists({
        learnerId: request.authenticatedUser._id,
        courseId: assignment.courseId,
        status: 'active',
      })) {
        sendError(response, 404, 'ASSIGNMENT_NOT_FOUND', 'Assignment was not found');
        return;
      }
      const submission = await submissionModel.findOne({ assignmentId, learnerId: request.authenticatedUser._id }).lean();
      noStore(response);
      response.status(200).json({ submission: submissionSummary(submission, { includeContent: true }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/assignments/:assignmentId/submissions/me', requireUser, requireRoles('learner'), validateBody(submissionSchema), async (request, response, next) => {
    try {
      const assignmentId = parseId(request.params.assignmentId, response, 'Assignment');
      if (!assignmentId) return;
      const assignment = await assignmentModel.findById(assignmentId);
      const course = assignment
        ? await courseModel.findOne({ _id: assignment.courseId, status: 'published' }).select('_id')
        : null;
      if (!assignment || !course || !await enrollmentModel.exists({
        learnerId: request.authenticatedUser._id,
        courseId: assignment.courseId,
        status: 'active',
      })) {
        sendError(response, 404, 'ASSIGNMENT_NOT_FOUND', 'Assignment was not found');
        return;
      }
      if (assignment.deadline <= new Date()) {
        sendError(response, 409, 'ASSIGNMENT_CLOSED', 'The submission deadline has passed');
        return;
      }
      let submission = await submissionModel.findOneAndUpdate(
        { assignmentId, learnerId: request.authenticatedUser._id, gradedAt: { $exists: false } },
        { $set: { content: request.validatedBody.content } },
        { new: true, runValidators: true },
      );
      if (!submission) {
        const currentSubmission = await submissionModel.findOne({
          assignmentId,
          learnerId: request.authenticatedUser._id,
        }).select('_id gradedAt').lean();
        if (currentSubmission?.gradedAt) {
          sendError(response, 409, 'SUBMISSION_GRADED', 'A graded submission can no longer be changed');
          return;
        }
        try {
          submission = await submissionModel.create({
            assignmentId,
            courseId: assignment.courseId,
            learnerId: request.authenticatedUser._id,
            content: request.validatedBody.content,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          if (assignment.deadline <= new Date()) {
            sendError(response, 409, 'ASSIGNMENT_CLOSED', 'The submission deadline has passed');
            return;
          }
          submission = await submissionModel.findOneAndUpdate(
            { assignmentId, learnerId: request.authenticatedUser._id, gradedAt: { $exists: false } },
            { $set: { content: request.validatedBody.content } },
            { new: true, runValidators: true },
          );
          if (!submission) {
            sendError(response, 409, 'SUBMISSION_GRADED', 'A graded submission can no longer be changed');
            return;
          }
        }
      }
      noStore(response);
      response.status(200).json({ submission: submissionSummary(submission.toObject(), { includeContent: true }) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/assignments/:assignmentId/submissions', requireUser, requireRoles('instructor', 'admin'), async (request, response, next) => {
    try {
      const assignmentId = parseId(request.params.assignmentId, response, 'Assignment');
      if (!assignmentId) return;
      const assignment = await assignmentModel.findById(assignmentId).select('_id courseId maxScore title');
      const course = assignment
        ? await courseModel.findById(assignment.courseId).select('_id instructorId')
        : null;
      if (!assignment || !course || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'ASSIGNMENT_NOT_FOUND', 'Assignment was not found');
        return;
      }
      const pagination = parsePagination(request.query, response);
      if (!pagination) return;
      const filter = { assignmentId };
      const [submissions, total] = await Promise.all([
        submissionModel.find(filter)
          .sort({ updatedAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .populate('learnerId', 'displayName')
          .lean(),
        submissionModel.countDocuments(filter),
      ]);
      noStore(response);
      response.status(200).json({
        assignment: { id: String(assignment._id), title: assignment.title, maxScore: assignment.maxScore },
        items: submissions.map((submission) => ({
          ...submissionSummary(submission, { includeContent: true }),
          learner: submission.learnerId
            ? { id: String(submission.learnerId._id), displayName: submission.learnerId.displayName }
            : null,
        })),
        pagination: paginationMeta(pagination, total),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/submissions/:submissionId/grade', requireUser, requireRoles('instructor', 'admin'), validateBody(gradeSchema), async (request, response, next) => {
    try {
      const submissionId = parseId(request.params.submissionId, response, 'Submission');
      if (!submissionId) return;
      const submission = await submissionModel.findById(submissionId).select('_id assignmentId courseId');
      const course = submission
        ? await courseModel.findById(submission.courseId).select('_id instructorId')
        : null;
      const assignment = submission ? await assignmentModel.findById(submission.assignmentId).select('_id maxScore') : null;
      if (!submission || !course || !assignment || !isOwnerOrAdmin(request.authenticatedUser, course)) {
        sendError(response, 404, 'SUBMISSION_NOT_FOUND', 'Submission was not found');
        return;
      }
      if (request.validatedBody.grade > assignment.maxScore) {
        sendError(response, 422, 'GRADE_OUT_OF_RANGE', 'The grade cannot exceed the assignment maximum score');
        return;
      }
      const updated = await submissionModel.findOneAndUpdate(
        { _id: submissionId },
        {
          $set: {
            grade: request.validatedBody.grade,
            feedback: request.validatedBody.feedback,
            gradedBy: request.authenticatedUser._id,
            gradedAt: new Date(),
          },
        },
        { new: true, runValidators: true },
      ).lean();
      noStore(response);
      response.status(200).json({ submission: submissionSummary(updated, { includeContent: true }) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/dashboard', requireUser, async (request, response, next) => {
    try {
      const user = request.authenticatedUser;
      let dashboard;
      if (user.role === 'admin') {
        const [userCounts, courseCounts, enrollmentCount, pendingReviews] = await Promise.all([
          userModel.aggregate([{ $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } }]),
          courseModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
          enrollmentModel.countDocuments({}),
          submissionModel.countDocuments({ gradedAt: { $exists: false } }),
        ]);
        dashboard = {
          role: 'admin',
          users: Object.fromEntries(userCounts.map((item) => [`${item._id.role}:${item._id.status}`, item.count])),
          courses: Object.fromEntries(courseCounts.map((item) => [item._id, item.count])),
          enrollmentCount,
          pendingReviews,
        };
      } else if (user.role === 'instructor') {
        const courses = await courseModel.find({ instructorId: user._id }).select('_id').lean();
        const courseIds = courses.map((course) => course._id);
        const [enrollmentCount, assignmentCount, pendingReviews] = courseIds.length > 0
          ? await Promise.all([
              enrollmentModel.countDocuments({ courseId: { $in: courseIds }, status: 'active' }),
              assignmentModel.countDocuments({ courseId: { $in: courseIds } }),
              submissionModel.countDocuments({ courseId: { $in: courseIds }, gradedAt: { $exists: false } }),
            ])
          : [0, 0, 0];
        dashboard = { role: 'instructor', courseCount: courses.length, enrollmentCount, assignmentCount, pendingReviews };
      } else {
        const enrollments = await enrollmentModel.find({ learnerId: user._id, status: 'active' })
          .select('courseId completedModuleIds')
          .lean();
        const courseIds = enrollments.map((enrollment) => enrollment.courseId);
        const courses = await courseModel.find({ _id: { $in: courseIds }, status: 'published' })
          .select('_id modules._id')
          .lean();
        const publishedCourseIds = courses.map((course) => course._id);
        const [graded, submittedCount, dueAssignments] = await Promise.all([
          submissionModel.find({ learnerId: user._id, courseId: { $in: publishedCourseIds }, gradedAt: { $exists: true } }).select('grade assignmentId').lean(),
          submissionModel.countDocuments({ learnerId: user._id, courseId: { $in: publishedCourseIds } }),
          assignmentModel.countDocuments({ courseId: { $in: publishedCourseIds }, deadline: { $gt: new Date() } }),
        ]);
        const gradedAssignments = graded.length > 0
          ? await assignmentModel.find({ _id: { $in: graded.map((submission) => submission.assignmentId) } })
              .select('_id maxScore')
              .lean()
          : [];
        const maxScoreByAssignment = new Map(gradedAssignments.map((assignment) => [String(assignment._id), assignment.maxScore]));
        const normalizedScores = graded
          .map((submission) => {
            const maxScore = maxScoreByAssignment.get(String(submission.assignmentId));
            return maxScore > 0 ? (Number(submission.grade) / maxScore) * 100 : undefined;
          })
          .filter(Number.isFinite);
        const publishedById = new Map(courses.map((course) => [String(course._id), course]));
        let totalModules = 0;
        let completedModules = 0;
        for (const enrollment of enrollments) {
          const course = publishedById.get(String(enrollment.courseId));
          if (!course) continue;
          totalModules += course.modules.length;
          const moduleIds = new Set(course.modules.map((module) => String(module._id)));
          completedModules += (enrollment.completedModuleIds ?? []).filter((id) => moduleIds.has(String(id))).length;
        }
        dashboard = {
          role: 'learner',
          enrolledCourseCount: courses.length,
          dueAssignmentCount: dueAssignments,
          submittedAssignmentCount: submittedCount,
          gradedAssignmentCount: graded.length,
          averageGrade: normalizedScores.length > 0
            ? Math.round((normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length) * 10) / 10
            : null,
          progress: {
            completedModules,
            totalModules,
            percent: totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0,
          },
        };
      }
      noStore(response);
      response.status(200).json({ dashboard });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
