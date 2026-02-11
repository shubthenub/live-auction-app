import { Router } from 'express';
import { register, login, refresh, logout, getMe } from './auth.controller.js';
import { authLimiter } from '@middleware/rateLimiter';
import { zodValidate } from '@common/zodValidate';
import { loginSchema, registerSchema } from './auth.schema.js';
import { authenticate } from '@/auth/auth.middleware.js';

const router = Router();

router.post('/register', zodValidate({ body: registerSchema }), register);
router.post('/login', zodValidate({ body: loginSchema }), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', authenticate,  getMe);


export default router;
 