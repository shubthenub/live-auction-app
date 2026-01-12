import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Role } from '../users/user.model.js';
import { env } from '../config/env.js';
import crypto from 'crypto';
import { RefreshToken } from './refreshToken.model.js';

export async function register(
  username: string,
  email: string,
  password: string,
  role: Role
) {
  const exists = await User.findOne({ username, email });
  if (exists) throw new Error('User already exists');

  const hash = await bcrypt.hash(password, 12);

  return User.create({
    username,
    email,
    passwordHash: hash,
    role,
  });
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Invalid credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid credentials');

  const accessToken = jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
    },
    env.JWT_SECRET, // ensure a long, random secret in env
    {
      algorithm: 'HS256',
      issuer: env.JWT_ISSUER,       // add to env
      audience: env.JWT_AUDIENCE,   // add to env
      expiresIn: '150m',
    }
  );

    const refreshToken = crypto.randomBytes(40).toString('hex');

    await RefreshToken.create({
        userId: user._id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

  return { accessToken, refreshToken };
}


