import { Router } from "express";
import auctionRoutes from "@api/v1/auctions/auction.route";
import authRoutes from "@api/v1/auth/auth.routes";

const router = Router();

router.use("/auctions", auctionRoutes);
router.use("/auth", authRoutes);

export default router;