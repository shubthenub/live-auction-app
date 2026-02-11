import { Request, Response } from 'express';
import * as auctionService from '../../../auctions/auction.service.js';
import { Types } from 'mongoose';

import {
  CreateAuctionRequestDTO,
  GetAuctionsQueryDTO,
  PaginatedAuctionsResponseDTO,
  SingleAuctionResponseDTO,
} from './auction.dto.js';

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
  } = trimmedBody as CreateAuctionRequestDTO;

  console.log(trimmedBody)
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }
  

  // Multer puts files here
  const files = req.files as Express.Multer.File[];

  const auction = await auctionService.createAuction({
    title: String(title),
    description: String(description),
    basePrice: Number(basePrice),
    minIncrement: minIncrement ? Number(minIncrement) : undefined,
    startTime: new Date(String(startTime)),
    endTime: new Date(String(endTime)),
    createdBy: req.user.id, // set by auth middleware
    files,
  });

    


  res.status(201).json(auction);
}

export async function getAuctions(req: Request, res: Response) {
  try {
    const {page, limit, status} = req.query as GetAuctionsQueryDTO;

    const result = await auctionService.getAuctions(page, limit, status);

    res.json({
      success: true,
      data: result.auctions,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch auctions',
    });
  }
}

export async function getMyAuctions(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthenticated' 
      });
    }

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const status = req.query.status as 'SCHEDULED' | 'LIVE' | 'ENDED' | undefined;

    const result = await auctionService.getSellerAuctions(
      req.user.id,
      page,
      limit,
      status
    );

    res.json({
      success: true,
      data: result.auctions,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Get seller auctions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch your auctions',
    });
  }
}

export async function getMyWonAuctions(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthenticated' 
      });
    }

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);

    const result = await auctionService.getWonAuctions(
      req.user.id,
      page,
      limit
    );

    res.json({
      success: true,
      data: result.auctions,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Get won auctions error:', error);
    res.status(500).json({success: false,
      message: error.message || 'Failed to fetch won auctions',
    });
  }
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
