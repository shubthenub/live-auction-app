import { Request, Response } from 'express';
import * as auctionService from './auction.service.js';
import { Types } from 'mongoose';

export async function createAuction(req: Request, res: Response) {

 const trimmedBody = Object.fromEntries(
    Object.entries(req.body).map(([key, value]) => [key.trim(), value])
  );
  const {
    title,
    description,
    basePrice,
    minIncrement,
    startTime,
    endTime,
  } = req.body;

  console.log(req.body)

  

  if(!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }
  

  // Multer puts files here
  const files = req.files as Express.Multer.File[];

  const auction = await auctionService.createAuction({
    title,
    description,
    basePrice: Number(basePrice),
    minIncrement: minIncrement ? Number(minIncrement) : undefined,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    createdBy: req.user.id, // set by auth middleware
    files,
  });

    


  res.status(201).json(auction);
}

export async function getAuctionById(req: Request, res: Response) {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid auction id' });
  }

  const auctionId = new Types.ObjectId(id);
  const auction = await auctionService.getAuctionById(auctionId);
  res.status(200).json(auction);
}
