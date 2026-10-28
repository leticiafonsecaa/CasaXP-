import type { NextFunction, Request, Response } from 'express';

/** Envolve rotas assíncronas: erros do banco viram resposta de erro, em vez de travar a requisição. */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
