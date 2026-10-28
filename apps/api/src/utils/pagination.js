import { z } from 'zod';

const paginationFields = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

export function createPaginationSchema(additionalFields = {}) {
  return z.object({ ...paginationFields, ...additionalFields }).strict();
}

const paginationSchema = createPaginationSchema();

export function parsePagination(query, response, schema = paginationSchema) {
  const result = schema.safeParse(query);
  if (!result.success) {
    response.status(400).json({
      error: { code: 'INVALID_PAGINATION', message: 'Pagination parameters are invalid' },
    });
    return undefined;
  }

  const { page, limit } = result.data;
  return { ...result.data, page, limit, skip: (page - 1) * limit };
}

export function paginationMeta({ page, limit }, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
