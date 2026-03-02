import { CorsOptions } from 'cors';

export const corsConfig: CorsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL // Will be set in production .env
    : [
        'http://localhost:5173', // Vite default
        'http://localhost:5174', // Alternative dev port
        'http://localhost:3000', // Backend itself (for testing)
      ],
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-JSON-Response-Length'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200, // For legacy browsers
};