import { Request, Response } from 'express';
import * as authService from '@auth/auth.service';
import { RefreshToken } from '@auth/refreshToken.model';
import { User } from '@users/user.model';
import { env } from '@config/env';

import jwt from 'jsonwebtoken';

import {
  LoginRequestDTO,
  LoginResponseDTO,
  RegisterRequestDTO,
} from './auth.dto';
import { registerSchema } from './auth.schema';

export async function register(req: Request, res: Response) {
  try {
    const { username, email, password, role } = req.body as RegisterRequestDTO;

   
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
        errors: result.error.flatten(),
      });
    }

    const dto = result.data;
    await authService.register(dto.username, dto.email, dto.password, dto.role);
    res.status(201).json({ 
      success: true,
      message: 'Registration successful' 
    });
  } catch (error: any) {
    console.error('Register error:', error);
    
    // Duplicate email/username error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        success: false,
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` 
      });
    }

    // Validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: error.message 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Registration failed. Please try again.' 
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body as LoginRequestDTO;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const { accessToken, refreshToken } = await authService.login(email, password);
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',       
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const response: LoginResponseDTO = {
      success: true,
      accessToken,
      message: 'Login successful',
    };
    
    res.json(response);;
  } catch (error: any) {
    console.error('Login error:', error);

    // Invalid credentials
    if (error.message === 'Invalid credentials' || error.message === 'User not found') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Login failed. Please try again.' 
    });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await RefreshToken.deleteOne({ token });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    });
    
    res.json({ 
      success: true,
      message: 'Logged out successfully' 
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Logout failed. Please try again.' 
    });
  }
}

export async function refresh(req: Request, res: Response) {
  try {
    const token = req.cookies?.refreshToken;
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No refresh token provided' 
      });
    }

    const stored = await RefreshToken.findOne({ token });
    
    if (!stored) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid refresh token' 
      });
    }

    if (stored.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ token });
      return res.status(401).json({ 
        success: false,
        message: 'Refresh token expired' 
      });
    }

    const user = await User.findById(stored.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const newAccessToken = jwt.sign(
      { sub: String(user._id), role: user.role },
      env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ 
      success: true,
      accessToken: newAccessToken 
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token format' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Token refresh failed. Please login again.' 
    });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // You can select which fields to return
    const { id, role } = req.user;
    res.json({
      id: id 
      // ...add other fields as needed
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}