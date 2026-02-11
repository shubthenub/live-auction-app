import { ZodError, ZodSchema, ZodTypeAny } from 'zod';
import { Request, Response, NextFunction } from 'express';
//Zod validation is done in the routes using the validate middleware, which is defined here. It takes a Zod schema as an argument and validates the request body against that schema. If validation fails, it returns a 400 response with the validation error message. If validation succeeds, it calls next() to proceed to the next middleware or route handler.

type RequestSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

export const zodValidate =
  (schemas: RequestSchemas) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.assign(req.query, parsed); // ✅ This mutates the existing object // <-- Override req.query with the parsed and validated query parameters
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.assign(req.params, parsed); // ✅ This mutates the existing object // <-- Override req.params with the parsed and validated params
      }
    console.log("[Zod] req.query after Zod:", req.query);
      console.log("[Zod] req.params after Zod:", req.params);
      console.log("[Zod] req.body after Zod:", req.body);
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid request",
          errors: err.flatten(),
          issues: err.issues,
        });
      }
      next(err);
    }
  };
