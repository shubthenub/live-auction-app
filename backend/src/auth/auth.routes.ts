import { Router } from 'express';
import { register, login, refresh, logout } from './auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refresh);


export default router;
