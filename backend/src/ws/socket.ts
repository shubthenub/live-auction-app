import { Server } from "socket.io";
import http from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Auction } from "../auctions/auction.model.js";
import { getLiveAuctionState, placeBid } from "../bidding/liveAuction.service.js";
import { scheduleBidBroadcast } from "./broadcaster.js";
import { User } from "../users/user.model.js";

let io: Server;

export function setupSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  // Auth middleware
  io.use( async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.log("Socket connection rejected: No token provided");
      return next(new Error("Unauthorized"));
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as any;

      if(process.env.NODE_ENV === "production" && payload.aud !== "http://localhost:3000") {//only do db check in production
        const user = await User.findById(payload.sub).lean();
        if (!user ) {
          return next(new Error("Unauthorized"));
        }
      }
      
      socket.data.user = {
        id: payload.sub,
        role: payload.role,
      };

      console.log("Socket authenticated for user:", payload.sub);
      next();
    } catch (err) {
      console.log("Socket connection rejected: Invalid token", err);
      next(new Error("Unauthorized"));
    }
  });


  //bidding handler 
  io.on("connection", (socket) => {
    const user = socket.data.user;
    console.log(" Socket connected:", socket.id, "User:", user.id);

    socket.on("joinAuction", async ({ auctionId }) => {
      const auction = await Auction.findById(auctionId);
      

      if (!auction || auction.status !== "LIVE") {
        socket.emit("error", "Auction not live");
        return;
      }

      if (user.role !== "USER") {
        socket.emit("error", "Only users can bid");
        return;
      }

      const auctionIdStr = auctionId.toString();

      socket.join(`auction:${auctionIdStr}`);
      const state = await getLiveAuctionState(auctionIdStr);

      if (!state) {
        socket.emit("error", "Auction not live due to no state in redis");
        return;
      }

      socket.join(`auction:${auctionIdStr}`);

      socket.emit("auctionState", {
        ...state,
      });


      console.log(`User ${user.id} joined auction ${auctionIdStr}`);
    });

    socket.on('placeBid', async ({ auctionId, amount }) => {
      try {
        const state = await placeBid(
          auctionId,
          amount,
          socket.data.user.id,
          100 
        );

        scheduleBidBroadcast(io, auctionId, {  //to throttle bid updates broadcast 
          currentPrice: state.currentPrice,
          highestBidderId: state.highestBidderId,
          roundEndsAt: state.roundEndsAt,
          serverTime: Date.now(),
        });

      } catch (err: any) {
        socket.emit('bidError', err.message);
      }
    });


    socket.on("leaveAuction", ({ auctionId }) => {
      const auctionIdStr = auctionId.toString();
      socket.leave(`auction:${auctionIdStr}`);
      console.log(`✅ User ${user.id} left auction ${auctionIdStr}`);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}
