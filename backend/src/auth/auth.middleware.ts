import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';




export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header && !req.cookies.accessToken) {
    return res.status(401).json({ message: 'Missing Authorization header or cookie' });
  }

  const tokenFromCookie = req.cookies.accessToken;
  const tokenFromHeader = req.headers.authorization?.split(' ')[1];
  
  const token = tokenFromHeader || tokenFromCookie;  //for manual tetsing with postman, we can use header, for frontend we will use cookie

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any;

    req.user = {
      id: payload.sub,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authorize(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  };
}
