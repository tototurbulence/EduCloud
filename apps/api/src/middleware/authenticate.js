export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function sendError(response, status, code, message) {
  response.status(status).json({ error: { code, message } });
}

export function destroySession(request) {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => error ? reject(error) : resolve());
  });
}

export function createAuthenticate({
  userModel,
  isDatabaseReady,
  cookieName,
  cookieClearOptions,
  allowPasswordChange = false,
  allowMfaSetup = false,
  allowMfaChallenge = false,
}) {
  return async function authenticate(request, response, next) {
    if (!isDatabaseReady()) {
      sendError(response, 503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable');
      return;
    }

    if (!request.session?.userId) {
      sendError(response, 401, 'UNAUTHENTICATED', 'Authentication is required');
      return;
    }

    const createdAt = Number(request.session.authCreatedAt);
    if (!Number.isFinite(createdAt) || Date.now() - createdAt >= SESSION_DURATION_MS) {
      await destroySession(request);
      response.clearCookie(cookieName, cookieClearOptions);
      sendError(response, 401, 'UNAUTHENTICATED', 'Authentication is required');
      return;
    }

    const user = await userModel.findById(request.session.userId)
      .select('_id displayName email role status mustChangePassword sessionVersion mfaEnabled')
      .lean();
    if (!user || user.status !== 'active') {
      await destroySession(request);
      response.clearCookie(cookieName, cookieClearOptions);
      sendError(response, 401, 'UNAUTHENTICATED', 'Authentication is required');
      return;
    }

    const sessionVersion = Number(request.session.userSessionVersion);
    if (!Number.isFinite(sessionVersion) || sessionVersion !== Number(user.sessionVersion ?? 0)) {
      await destroySession(request);
      response.clearCookie(cookieName, cookieClearOptions);
      sendError(response, 401, 'UNAUTHENTICATED', 'Authentication is required');
      return;
    }

    if (user.role === 'admin') {
      if (!user.mfaEnabled) {
        if (!allowMfaSetup || request.session.mfaSetupRequired !== true) {
          sendError(response, 403, 'MFA_SETUP_REQUIRED', 'Set up administrator multi-factor authentication before continuing');
          return;
        }
      } else if (request.session.mfaVerified !== true) {
        if (!allowMfaChallenge || request.session.mfaChallenge !== true) {
          sendError(response, 403, 'MFA_REQUIRED', 'Complete multi-factor authentication before continuing');
          return;
        }
      }
    }

    if ((request.session.mfaSetupRequired === true && !allowMfaSetup)
      || (request.session.mfaChallenge === true && !allowMfaChallenge)) {
      sendError(response, 403, user.role === 'admin' && user.mfaEnabled ? 'MFA_REQUIRED' : 'MFA_SETUP_REQUIRED', 'Complete the security check before continuing');
      return;
    }

    if (user.mustChangePassword && !allowPasswordChange) {
      sendError(response, 403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password before using this service');
      return;
    }

    request.authenticatedUser = user;
    next();
  };
}

export function requireRoles(...allowedRoles) {
  return function authorizeRole(request, response, next) {
    if (!request.authenticatedUser) {
      sendError(response, 401, 'UNAUTHENTICATED', 'Authentication is required');
      return;
    }
    if (!allowedRoles.includes(request.authenticatedUser.role)) {
      sendError(response, 403, 'FORBIDDEN', 'You are not allowed to perform this action');
      return;
    }
    next();
  };
}
