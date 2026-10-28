export function errorHandler(error, _request, response, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const isServerError = status >= 500;

  if (isServerError) {
    // Do not log request bodies, headers, credentials, or error details that may contain secrets.
    console.error('Unhandled API error', { status });
  }

  response.status(status).json({
    error: {
      code: isServerError ? 'INTERNAL_SERVER_ERROR' : (error.code ?? 'REQUEST_ERROR'),
      message: isServerError ? 'An unexpected error occurred' : error.message,
    },
  });
}
