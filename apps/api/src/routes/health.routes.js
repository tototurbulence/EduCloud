import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/live', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'educloud-api',
  });
});
