import { Router } from "express";
import auctionRoutes from "@api/v1/auctions/auction.route.js";
import authRoutes from "@api/v1/auth/auth.routes.js";
import healthRoutes from "@api/v1/health/health.route.js";

const router = Router();

router.use("/auctions", auctionRoutes);
router.use("/auth", authRoutes);
router.use("/health", healthRoutes);

export default router;