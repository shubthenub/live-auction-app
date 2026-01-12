import express from 'express';
// import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './auth/auth.routes.js';
import auctionRoutes from './auctions/auction.route.js';
import cookieParser from 'cookie-parser';
import testUploadRoutes from './common/testUpload.route.js';


dotenv.config();

export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use('/auth', authRoutes);
app.use('/test', testUploadRoutes);
app.use('/auctions', auctionRoutes);
