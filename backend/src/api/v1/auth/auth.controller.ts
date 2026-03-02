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
import { cookieConfig } from '@/config/cookie';

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
    
    // set both tokens in httpOnly cookies
    res.cookie('accessToken', accessToken, cookieConfig.accessToken);
    res.cookie('refreshToken', refreshToken, cookieConfig.refreshToken);

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
      const refreshToken = req.cookies.refreshToken;
      const result = await authService.logout(refreshToken);
      
      // Override maxAge to expire immediately
      res.cookie('accessToken', '', {
        ...cookieConfig.accessToken,
        maxAge: 0, // Expire immediately
        expires: new Date(0) // Set to past date
      });
      
      res.cookie('refreshToken', '', {
        ...cookieConfig.refreshToken,
        maxAge: 0,
        expires: new Date(0)
      });

      
      res.json(result);
    } catch (error:any) {
      res.status(500).json({ error: error.message });
    }
  }

export async function refresh(req: Request, res: Response) {
  try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
      }

      const result = await authService.refreshAccessToken(refreshToken);
      
      res.cookie('accessToken', result.accessToken, cookieConfig.accessToken);
      
      res.json({ message: 'Token refreshed successfully' });
    } catch (error: any) {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      res.status(401).json({ error: error.message });
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