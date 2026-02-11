import express from 'express';
// import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './api/v1/auth/auth.routes.js';
import auctionRoutes from './api/v1/auctions/auction.route.js';
import cookieParser from 'cookie-parser';
import testUploadRoutes from './common/testUpload.route.js';
import v1Routes from '@api/v1/index.js';


dotenv.config();

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/test', testUploadRoutes);
app.use('/api/v1', v1Routes);
