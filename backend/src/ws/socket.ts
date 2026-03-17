import { Server } from "socket.io";
import http from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Auction } from "../auctions/auction.model.js";
import { getLiveAuctionState, placeBid } from "../bidding/liveAuction.service.js";
import { scheduleBidBroadcast } from "./broadcaster.js";
import { User } from "../users/user.model.js";
import { Wallet } from "../wallet/wallet.model.js";
import { redis } from "../config/redis.js";

let io: Server;

// --- Log rate limiter for load test noise ---
const counters: Record<string, number> = {};
function throttleLog(key: string, threshold: number, msg: () => string) {
  counters[key] = (counters[key] || 0) + 1;
  if (counters[key] % threshold === 1) {
    console.log(`[${counters[key]}x] ${msg()}`);
  }
}


export function setupSocket(server: http.Server) {
  io = new Server(server, {
    cors: { origin: "*" },
    transports: ["websocket"]
  }); 

  // Auth middleware
  io.use( async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      throttleLog('noToken', 100, () => 'Socket connection rejected: No token provided')
      return next(new Error("Unauthorized"));
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as any;

      // if(process.env.NODE_ENV === "production" && payload.aud !== "http://localhost:3000") {//only do db check in production
      //   const user = await User.findById(payload.sub).lean();
      //   if (!user ) {
      //     return next(new Error("Unauthorized"));
      //   }
      // }
      
      socket.data.user = {
        id: payload.sub,
        role: payload.role,
      };

      throttleLog('authOk', 500, () => `Socket authenticated (latest: ${payload.sub})`);
      next();
    } catch (err) {
      console.log("Socket connection rejected: Invalid token", err);
      next(new Error("Unauthorized"));
    }
  });


  //bidding handler 
  io.on("connection", (socket) => {
    const user = socket.data.user;
    throttleLog('connected', 500, () => `Socket connected (latest: ${socket.id})`);

    socket.on("joinAuction", async ({ auctionId }) => {
      // const auction = await Auction.findById(auctionId);
      

      // if (!auction || auction.status !== "LIVE") {
      //   socket.emit("auctionError", "Auction not live");
      //   return;
      // }

      if (user.role !== "USER") {
        socket.emit("userError", "Only users can bid");
        return;
      }

      const auctionIdStr = auctionId.toString();

      // // Single auction check: if user has any locked amount, reject
      // const locked = await redis.hget(`wallet:${user.id}`, 'locked');
      // if (locked && parseFloat(locked) > 0) {
      //   socket.emit("walletError", "You are already in an active auction. Leave that auction first.");
      //   return;
      // }

      const state = await getLiveAuctionState(auctionIdStr);

      if (!state) {
        socket.emit("redisError", "Auction not live due to no state in redis");
        return;
      }

      socket.join(`auction:${auctionIdStr}`);
      socket.data.auctionId = auctionIdStr;


      // Check user's wallet balance — Redis first, fallback to DB
      let balance: number;

      // fetch only required fields instead of entire hash
      const [balanceStr, lockedStr] = await redis.hmget(
        `wallet:${user.id}`,
        "balance",
        "locked"
      );

      if (balanceStr) {
        // Cache hit — use Redis balance directly
        balance = parseFloat(balanceStr);

        const locked = parseFloat(lockedStr || "0");
        if (locked > 0) { // user already highest bidder somewhere
          socket.emit(
            "walletError",
            "You are already in an active auction. Leave that auction first."
          );
          return;
        }

      } else {
        // Cache miss — query DB
        const userDoc = await User.findById(user.id).select("walletId").lean();
        if (!userDoc?.walletId) {
          socket.emit("walletError", "User wallet not found");
          return;
        }

        const wallet = await Wallet.findById(userDoc.walletId).lean();
        if (!wallet || typeof wallet.balance !== "number") {
          socket.emit("walletError", "Invalid wallet data");
          return;
        }

        balance = wallet.balance;

        // hydrate Redis cache
        await redis
          .multi()
          .hset(`wallet:${user.id}`, {
            balance: balance.toString(),
            locked: "0",
          })
          .expire(`wallet:${user.id}`, 3600)
          .exec();
      }

      if (balance < state.currentPrice) {
        socket.emit("walletError", "Insufficient balance");
        return;
      }


      throttleLog('joined', 500, () => `User ${user.id} joined auction ${auctionIdStr}`);
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
          currentPrice: Number(state.currentPrice),
          highestBidderId: String(state.highestBidderId),
          roundEndsAt: Number(state.roundEndsAt),
          serverTime: Date.now(),
        });

      } catch (err: any) {
        socket.emit('bidError', err.message);
      }
    });


    socket.on("leaveAuction", async ({ auctionId }) => {
      const auctionIdStr = auctionId.toString();
      try {
        const state = await getLiveAuctionState(auctionIdStr);
        
        // Unlock wallet only if user is NOT the highest bidder
        if (state && state.highestBidderId !== user.id) {
          await redis.hset(`wallet:${user.id}`, 'locked', '0');
        }
      } catch (err) {
        console.error("Error unlocking wallet on leave:", err);
      }
      socket.leave(`auction:${auctionIdStr}`);
      console.log(`User ${user.id} left auction ${auctionIdStr}`);
    });

    socket.on("disconnect", async () => {
      const auctionIdStr = socket.data.auctionId; //use this instead of header based auction ID
      
      console.log("Socket disconnected:", socket.id, "User:", user.id);
      
      // If user disconnects while NOT winning, unlock wallet immediately
      // This prevents funds from being locked indefinitely if client crashes
      try {
        if (auctionIdStr) {
          const state = await getLiveAuctionState(auctionIdStr);
          if (state && state.highestBidderId !== user.id) {
            await redis.hset(`wallet:${user.id}`, 'locked', '0');
          }
        }
      } catch (err) {
        console.error("Error unlocking wallet on disconnect:", err);
      }
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


//notes - 
// User joins → wallet locked 
// User leaves room → wallet stays locked 
// User disconnects → wallet stays locked 
// Auction ends → endAuction() releases/transfers funds 