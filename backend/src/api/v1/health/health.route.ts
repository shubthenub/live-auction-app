import { Router, Request, Response, NextFunction } from 'express';
import { redis } from '../../../config/redis.js';
import mongoose from 'mongoose';

const router = Router();

// Guard: require ?token=<HEALTH_SECRET> or X-Health-Token header
router.use((req: Request, res: Response, next: NextFunction) => {
  const token = req.query.token ?? req.headers['x-health-token'];
  if (token !== process.env.HEALTH_SECRET) {
    res.status(404).json({ message: 'Not found' }); // 404, not 401 — don't reveal it exists
    return;
  }
  next();
});


router.get('/', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  // Ping Redis (keeps Upstash alive)
  try {
    const reply = await redis.ping();
    checks.redis = reply === 'PONG' ? 'ok' : 'degraded';
  } catch {
    checks.redis = 'error';
  }

  // Check Mongoose connection state
  checks.mongo = mongoose.connection.readyState === 1 ? 'ok' : 'error';

  const allOk = Object.values(checks).every((v) => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
