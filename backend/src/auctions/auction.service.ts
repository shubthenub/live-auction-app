import { Auction } from './auction.model.js';
import { cloudinaryImageUpload } from '../common/cloudinaryImageUpload.js';
import { Types } from 'mongoose';
import { rabbitmq } from '../config/rabbitmq.js';

interface CreateAuctionInput {
  title: string;
  description?: string;
  basePrice: number;
  minIncrement?: number;
  startTime: Date;
  endTime: Date;
  createdBy: string;
  files: Express.Multer.File[];
}

export async function createAuction(input: CreateAuctionInput) {
  const {
    title,
    description,
    basePrice,
    minIncrement = 10,
    startTime,
    endTime,
    createdBy,
    files,
  } = input;

    console.log('TITLE:', input.title);
    console.log('FILES:', input.files);
  // ---- Basic validations ----
  if (!title || !basePrice || !startTime || !endTime) {
    throw new Error('Missing required fields');
  }

  if (!files || files.length === 0) {
    throw new Error('At least one image is required');
  }

  if (files.length > 5) {
    throw new Error('Maximum 5 images allowed');
  }

  // ---- Time validations ----
  const now = new Date();

  if (startTime <= now) {
    throw new Error('Start time must be in the future');
  }

  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = durationMs / (1000 * 60);

  if (durationMinutes < 5 || durationMinutes > 10) {
    throw new Error('Auction duration must be between 5 and 10 minutes');
  }

  const createdByObjectId = new Types.ObjectId(createdBy);

  // ---- Upload images to Cloudinary ----
  const uploadedImages = await Promise.all(
    files.map((file, index) =>
        cloudinaryImageUpload(file.buffer, 'auctions').then((url) => ({
        url,
        order: index,
        }))
    )
  );


  // ---- Create auction ----
  const auction = await Auction.create({
    title,
    description,
    images: uploadedImages,
    basePrice,
    minIncrement,
    startTime,
    endTime,
    status: 'SCHEDULED',
    createdBy: createdByObjectId,
  });
  try {
    await rabbitmq.scheduleAuctionStart(auction._id.toString(), startTime);
    console.log("Checking date and time after publishing schedule auction message: ", startTime)
    console.log(`✅ Auction ${auction._id} scheduled to start at ${startTime.toISOString()}`);
  } catch (error) {
    console.error('❌ Failed to schedule auction:', error);
  }
  return auction;
}


export async function getAuctions(
  page: number = 1,
  limit: number = 10,
  status?: 'SCHEDULED' | 'LIVE' | 'ENDED'
) {
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (status) {
    filter.status = status;
  }

  const [auctions, total] = await Promise.all([
    Auction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Auction.countDocuments(filter),
  ]);

  return {
    auctions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

export async function getSellerAuctions(
  sellerId: Types.ObjectId | string,
  page: number = 1,
  limit: number = 10,
  status?: 'SCHEDULED' | 'LIVE' | 'ENDED'
) {
  const skip = (page - 1) * limit;

  const sellerObjectId =
    typeof sellerId === 'string'
      ? new Types.ObjectId(sellerId)
      : sellerId;

  const filter: any = { createdBy: sellerObjectId };
  if (status) {
    filter.status = status;
  }

  const [auctions, total] = await Promise.all([
    Auction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Auction.countDocuments(filter),
  ]);

  return {
    auctions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

export async function getWonAuctions(
  userId: Types.ObjectId | string,
  page: number = 1,
  limit: number = 10,
) {
  const skip = (page - 1) * limit;

  const userObjectId =
    typeof userId === 'string'
      ? new Types.ObjectId(userId)
      : userId;

  const filter: any = { 
    winnerId: userObjectId,
    status: 'ENDED' // Default to ENDED for won auctions
  };

  const [auctions, total] = await Promise.all([
    Auction.find(filter)
      .sort({ endTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Auction.countDocuments(filter),
  ]);

  return {
    auctions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

export async function getAuctionById(auctionId: Types.ObjectId | string) {
  const id =
    typeof auctionId === 'string'
      ? (Types.ObjectId.isValid(auctionId) ? new Types.ObjectId(auctionId) : null)
      : auctionId;

  if (!id || !Types.ObjectId.isValid(id)) {
    throw new Error('Invalid auction id');
  }

  const auction = await Auction.findById(id).populate('createdBy', 'username email');
  if (!auction) {
    throw new Error('Auction not found');
  }
  return auction;
}