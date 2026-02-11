//    REQUEST DTOs
import { createAuctionSchema, getAuctionsQuerySchema } from "./auction.schema";
import { z } from "zod";

export type CreateAuctionRequestDTO = z.infer<typeof createAuctionSchema>;

export type GetAuctionsQueryDTO = z.infer<typeof getAuctionsQuerySchema>;


// RESPONSE DTOs

export interface AuctionSummaryDTO {
  id: string;
  title: string;
  basePrice: number;
  currentPrice: number;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  startTime: string;
  endTime: string;
}

export interface PaginatedAuctionsResponseDTO {
  success: true;
  data: AuctionSummaryDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SingleAuctionResponseDTO {
  success: true;
  data: any; // keeping `any` for now 
}
