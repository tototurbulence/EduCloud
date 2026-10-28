import { randomBytes, timingSafeEqual } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createCsrfToken() {
  return randomBytes(32).toString('base64url');
}

export function csrfProtection(allowedOrigins) {
  return function verifyCsrf(request, response, next) {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const origin = request.get('origin');
    if ((origin && !allowedOrigins.has(origin)) || origin === 'null') {
      response.status(403).json({
        error: { code: 'CSRF_REJECTED', message: 'Request origin is not allowed' },
      });
      return;
    }

    if (request.get('sec-fetch-site') === 'cross-site') {
      response.status(403).json({
        error: { code: 'CSRF_REJECTED', message: 'Cross-site state changes are not allowed' },
      });
      return;
    }

    const supplied = request.get('x-csrf-token');
    const expected = request.session?.csrfToken;
    if (typeof supplied !== 'string' || typeof expected !== 'string') {
      response.status(403).json({
        error: { code: 'CSRF_REJECTED', message: 'A valid CSRF token is required' },
      });
      return;
    }

    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
      response.status(403).json({
        error: { code: 'CSRF_REJECTED', message: 'A valid CSRF token is required' },
      });
      return;
    }

    next();
  };
}
