import { Router } from 'express';
import { createAuction, getMyAuctions, getAuctions, getAuctionById, getMyWonAuctions } from './auction.controller.js';
import { authenticate } from '@auth/auth.middleware.js';
import { authorize } from '@auth/auth.middleware.js';
import { uploadImage } from '@common/uploadImage.js';
import { endAuction, startAuction } from '@auctions/auction.scheduler.js';
import { Types } from 'mongoose';
import {  zodValidate } from '@common/zodValidate.js';
import { getAuctionsQuerySchema, createAuctionSchema, } from './auction.schema.js';

const router = Router();

// Create auction (AUCTIONEER only)
router.post(
  '/',
  authenticate,
  authorize(['AUCTIONEER']),
  uploadImage.array('images', 5),
  zodValidate({ body: createAuctionSchema }),
  createAuction
);


router.get('/',  authenticate, authorize(['USER', 'AUCTIONEER']), zodValidate({ query: getAuctionsQuerySchema }), getAuctions)

router.get('/my-auctions', authenticate, authorize(['AUCTIONEER']),  getMyAuctions)

router.get('/my-wins', authenticate, authorize(['USER']), getMyWonAuctions)

router.post(
    '/:id/start',
    authenticate,
    authorize(['AUCTIONEER']),
    async (req, res) => {
      const auctionId = new Types.ObjectId(String(req.params.id));
      await startAuction(auctionId);
      res.json({ message: 'Auction started' });
    }
  );

router.post(
  '/:id/end',
  authenticate,
  authorize(['AUCTIONEER']),
  async (req, res) => {
    try {
      const { finalPrice, winnerId } = req.body;

      const auctionId = String(req.params.id);

      if (!Types.ObjectId.isValid(auctionId)) {
        return res.status(400).json({ message: 'Invalid auction id' });
      }

      await endAuction(
        new Types.ObjectId(auctionId),
        Number(finalPrice),
        winnerId ? new Types.ObjectId(String(winnerId)) : null
      );

      res.json({ message: 'Auction ended' });
    } catch (error: any) {
      if (error.message === 'Auction not found' || error.message === 'Auction is not live') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to end auction manually', error: error.message });
    }
  }
);

router.get('/:id', authenticate, authorize(['USER', 'AUCTIONEER']), getAuctionById)
// Rule: Always put specific paths before dynamic params

export default router;
