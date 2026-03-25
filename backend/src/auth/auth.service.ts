import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User, Role } from "../users/user.model.js";
import { env } from "../config/env.js";
import crypto from "crypto";
import { RefreshToken } from "./refreshToken.model.js";
import { Wallet } from "../wallet/wallet.model.js";
import { startSession } from "mongoose";

export async function register(
  username: string,
  email: string,
  password: string,
  role: Role,
) {
  const exists = await User.findOne({ username, email });
  if (exists) throw new Error("User already exists");

  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create([
      {
        username: username.trim(),
        email: email.toLowerCase(),
        passwordHash: hash,
        role,
      },
    ]);

    const wallet = await Wallet.create([
      {
        userId: user[0]._id,
        balance: 100000,
        locked: 0,
      },
    ]);

    // LINK WALLET TO USER
    await User.findByIdAndUpdate(user[0]._id, { walletId: wallet[0]._id });

    console.log(`User registered: ${user[0]._id}`);

    return {
      userId: user[0]._id,
      email: user[0].email,
      role: user[0].role,
    };
  } catch (error) {
    throw error;
  }
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid credentials");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Invalid credentials");

  const accessToken = jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
    },
    env.JWT_SECRET, // ensure a long, random secret in env
    {
      algorithm: "HS256",
      issuer: env.JWT_ISSUER, // add to env
      audience: env.JWT_AUDIENCE, // add to env
      expiresIn: "10m",
    },
  );

  const refreshToken = crypto.randomBytes(40).toString("hex");

  await RefreshToken.create({
    userId: user._id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  const storedToken = await RefreshToken.findOne({ token: refreshToken });
  
  if (!storedToken) {
    throw new Error('Invalid refresh token');
  }

  if (storedToken.expiresAt < new Date()) {
    await RefreshToken.deleteOne({ token: refreshToken });
    throw new Error('Refresh token expired');
  }

  const user = await User.findById(storedToken.userId);
  if (!user) {
    throw new Error('User not found');
  }

  const accessToken = jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: '10m',
    }
  );

  return { accessToken };
}

export async function logout(refreshToken?: string) {
  try {
    if (!refreshToken) {
      return { message: 'No refresh token provided' };
    }

    // Delete refresh token from database
    const result = await RefreshToken.deleteOne({ token: refreshToken });

    if (result.deletedCount === 0) {
      // Token not found in database (already deleted or invalid)
      return { message: 'Refresh token not found' };
    }

    return { message: `Logged out successfully, deleted Token was: ${refreshToken}` };
  } catch (error:any) {
    throw new Error(`Logout failed: ${error.message}`);
  }
}



/* 
  ┌─────────────────────────────────────────────────────────────────────┐
│                         INITIAL LOGIN FLOW                           │
└─────────────────────────────────────────────────────────────────────┘

Frontend (Browser)              Backend Server              Database
      │                              │                          │
      │ 1. POST /auth/login         │                          │
      │    {email, password} ───────>│                          │
      │                              │                          │
      │                              │ 2. Validate credentials  │
      │                              │ ──────────────────────> │
      │                              │ <────────────────────── │
      │                              │                          │
      │                              │ 3. Generate accessToken  │
      │                              │    (JWT, expires 15m)    │
      │                              │                          │
      │                              │ 4. Generate refreshToken │
      │                              │    (Random, expires 7d)  │
      │                              │                          │
      │                              │ 5. Store refreshToken    │
      │                              │ ──────────────────────> │
      │                              │ <────────────────────── │
      │                              │                          │
      │ 6. Set-Cookie:              │                          │
      │    accessToken (HttpOnly)   │                          │
      │    refreshToken (HttpOnly)  │                          │
      │ <───────────────────────────│                          │
      │                              │                          │
      │ 7. Response: {user: {...}}  │                          │
      │ <───────────────────────────│                          │
      │                              │                          │
   [Cookies stored in browser]      │                          │
      │                              │                          │


┌─────────────────────────────────────────────────────────────────────┐
│                    MAKING AUTHENTICATED REQUESTS                     │
└─────────────────────────────────────────────────────────────────────┘

Frontend (Browser)              Backend Server              Database
      │                              │                          │
      │ 1. GET /api/auctions        │                          │
      │    Cookie: accessToken ─────>│                          │
      │                              │                          │
      │                              │ 2. Verify accessToken    │
      │                              │    (Check signature,     │
      │                              │     expiry, issuer)      │
      │                              │                          │
      │                              │ 3. Fetch auctions        │
      │                              │ ──────────────────────> │
      │                              │ <────────────────────── │
      │                              │                          │
      │ 4. Response: {auctions:[]}  │                          │
      │ <───────────────────────────│                          │
      │                              │                          │


┌─────────────────────────────────────────────────────────────────────┐
│                   ACCESS TOKEN EXPIRY & REFRESH                      │
└─────────────────────────────────────────────────────────────────────┘

Frontend (Browser)              Backend Server              Database
      │                              │                          │
      │ 1. GET /api/profile         │                          │
      │    Cookie: accessToken ─────>│                          │
      │    (expired!)                │                          │
      │                              │ 2. Verify accessToken    │
      │                              │    ❌ EXPIRED!          │
      │                              │                          │
      │ 3. 401 Unauthorized         │                          │
      │ <───────────────────────────│                          │
      │                              │                          │
┌─────┴─────┐                       │                          │
│ Axios     │                       │                          │
│ Intercepts│                       │                          │
│ 401       │                       │                          │
└─────┬─────┘                       │                          │
      │                              │                          │
      │ 4. POST /auth/refresh       │                          │
      │    Cookie: refreshToken ────>│                          │
      │                              │                          │
      │                              │ 5. Validate refreshToken │
      │                              │ ──────────────────────> │
      │                              │ <─ token found, valid ─ │
      │                              │                          │
      │                              │ 6. Generate NEW         │
      │                              │    accessToken           │
      │                              │    (expires 15m)         │
      │                              │                          │
      │ 7. Set-Cookie:              │                          │
      │    accessToken (new)         │                          │
      │ <───────────────────────────│                          │
      │                              │                          │
┌─────┴─────┐                       │                          │
│ Axios     │                       │                          │
│ Retries   │                       │                          │
│ Original  │                       │                          │
└─────┬─────┘                       │                          │
      │                              │                          │
      │ 8. GET /api/profile         │                          │
      │    Cookie: accessToken (new)>│                          │
      │                              │                          │
      │                              │ 9. Verify accessToken    │
      │                              │    ✅ VALID!            │
      │                              │                          │
      │                              │ 10. Fetch profile        │
      │                              │ ──────────────────────> │
      │                              │ <────────────────────── │
      │                              │                          │
      │ 11. Response: {user: {...}} │                          │
      │ <───────────────────────────│                          │
      │                              │                          │


┌─────────────────────────────────────────────────────────────────────┐
│                            LOGOUT FLOW                               │
└─────────────────────────────────────────────────────────────────────┘

Frontend (Browser)              Backend Server              Database
      │                              │                          │
      │ 1. POST /auth/logout        │                          │
      │    Cookie: accessToken      │                          │
      │    Cookie: refreshToken ────>│                          │
      │                              │                          │
      │                              │ 2. Verify accessToken    │
      │                              │    ✅ VALID              │
      │                              │                          │
      │                              │ 3. Delete refreshToken   │
      │                              │ ──────────────────────> │
      │                              │ <────────────────────── │
      │                              │                          │
      │ 4. Clear-Cookie:            │                          │
      │    accessToken               │                          │
      │    refreshToken              │                          │
      │ <───────────────────────────│                          │
      │                              │                          │
   [Cookies deleted from browser]   │                          │
      │                              │                          │
      │ 5. Response: {message: ...} │                          │
      │ <───────────────────────────│                          │
      │                              │                          │
*/
