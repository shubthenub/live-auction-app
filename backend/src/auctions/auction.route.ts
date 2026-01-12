import { Router } from 'express';
import { createAuction } from './auction.controller.js';
import { authenticate } from '../auth/auth.middleware.js';
import { authorize } from '../auth/auth.middleware.js';
import { uploadImage } from '../common/uploadImage.js';
import { getAuctionById } from './auction.controller.js';
import { endAuction, startAuction } from './auction.scheduler.js';
import { Types } from 'mongoose';

const router = Router();

// Create auction (AUCTIONEER only)
router.post(
  '/',
  authenticate,
  authorize(['AUCTIONEER']),
  uploadImage.array('images', 5),
  createAuction
);

router.get('/:id', authenticate, authorize(['USER', 'AUCTIONEER']), getAuctionById)
router.post(
    '/:id/start',
    authenticate,
    authorize(['AUCTIONEER']),
    async (req, res) => {
      const auctionId = new Types.ObjectId(req.params.id);
      await startAuction(auctionId);
      res.json({ message: 'Auction started' });
    }
  );

router.post(
  '/:id/end',
  authenticate,
  authorize(['AUCTIONEER']),
  async (req, res) => {
    const { finalPrice, winnerId } = req.body;

    if (!Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid auction id' });
    }

    await endAuction(
      new Types.ObjectId(req.params.id),
      Number(finalPrice),
      winnerId ? new Types.ObjectId(winnerId) : null
    );

    res.json({ message: 'Auction ended' });
  }
);

export default router;
