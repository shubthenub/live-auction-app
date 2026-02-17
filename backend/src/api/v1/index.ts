import { Router } from "express";
import auctionRoutes from "@api/v1/auctions/auction.route.js";
import authRoutes from "@api/v1/auth/auth.routes.js";

const router = Router();

router.use("/auctions", auctionRoutes);
router.use("/auth", authRoutes);

export default router;