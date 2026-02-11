import { loginSchema, registerSchema } from "./auth.schema";
import { z } from "zod";


//Request DTOs
export type RegisterRequestDTO = z.infer<typeof registerSchema>;
export type LoginRequestDTO = z.infer<typeof loginSchema>;

//Response DTOs
export interface RegisterResponseDTO {
  success: true;
  message: string;
}

export interface LoginResponseDTO {
  success: true;
  accessToken: string;
  message: string;
}

export interface RefreshResponseDTO {
  success: true;
  accessToken: string;
}
