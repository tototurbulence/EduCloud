import { Router } from 'express';
import { createAuthenticate, requireRoles } from '../middleware/authenticate.js';
import { paginationMeta, parsePagination } from '../utils/pagination.js';

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

export function createEnrollmentRouter({
  userModel,
  courseModel,
  enrollmentModel,
  isDatabaseReady,
  cookieName,
  cookieClearOptions,
}) {
  const router = Router();
  const requireUser = createAuthenticate({ userModel, isDatabaseReady, cookieName, cookieClearOptions });

  router.get('/me', requireUser, requireRoles('learner'), async (request, response, next) => {
    try {
      response.set('Cache-Control', 'private, no-store');
      const pagination = parsePagination(request.query, response);
      if (!pagination) return;
      const filter = { learnerId: request.authenticatedUser._id };
      const [enrollments, total] = await Promise.all([
        enrollmentModel.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .populate({
            path: 'courseId',
            select: 'title description status instructorId',
            populate: { path: 'instructorId', select: 'displayName' },
          })
          .lean(),
        enrollmentModel.countDocuments(filter),
      ]);
      response.status(200).json({
        items: enrollments.map((enrollment) => ({
          id: String(enrollment._id),
          status: enrollment.status,
          enrolledAt: enrollment.createdAt,
          course: enrollment.courseId ? {
            id: String(enrollment.courseId._id),
            title: enrollment.courseId.title,
            description: enrollment.courseId.description,
            status: enrollment.courseId.status,
            instructor: enrollment.courseId.instructorId
              ? {
                  id: String(enrollment.courseId.instructorId._id),
                  displayName: enrollment.courseId.instructorId.displayName,
                }
              : null,
          } : null,
        })),
        pagination: paginationMeta(pagination, total),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
