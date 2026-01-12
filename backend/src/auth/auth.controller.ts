import { Request, Response } from 'express';
import * as authService from './auth.service.js';
import { RefreshToken } from './refreshToken.model.js';
import { User } from '../users/user.model.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export async function register(req: Request, res: Response) {
  const { username, email, password, role } = req.body;

  await authService.register(username, email, password, role);
  res.status(201).json({ message: 'Registered' });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const { accessToken, refreshToken } = await authService.login(email, password);
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',       
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ accessToken });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.refreshToken;
  if (token) {
    await RefreshToken.deleteOne({ token });
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  });
  res.json({ message: 'Logged out' });
}


export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ message: 'No refresh token' });
  }

  const stored = await RefreshToken.findOne({ token });
  if (!stored || stored.expiresAt < new Date()) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }

  const user = await User.findById(stored.userId);
  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  const newAccessToken = jwt.sign(
    { sub: String(user._id), role: user.role },
    env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  res.json({ accessToken: newAccessToken });
}

