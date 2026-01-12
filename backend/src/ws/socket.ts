import { Server } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Auction } from '../auctions/auction.model.js';

let io: Server;

export function setupSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: '*', 
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log('❌ Socket connection rejected: No token provided');
      return next(new Error('Unauthorized'));
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as any;

      socket.data.user = {
        id: payload.sub,
        role: payload.role,
      };

      console.log('✅ Socket authenticated for user:', payload.sub);
      next();
    } catch (err) {
      console.log('❌ Socket connection rejected: Invalid token', err);
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log('🔌 Socket connected:', socket.id, 'User:', user.id);

    socket.on('joinAuction', async ({ auctionId }) => {
        const auction = await Auction.findById(auctionId);

        if (!auction || auction.status !== 'LIVE') {
            socket.emit('error', 'Auction not live');
            return;
        }

        if (user.role !== 'USER') {
            socket.emit('error', 'Only users can bid');
            return;
        }

        socket.join(`auction:${auctionId}`);

        socket.emit('joinedAuction', {
            auctionId,
        });

        console.log(
            `✅ User ${user.id} joined auction ${auctionId}`
        );
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected:', socket.id);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}