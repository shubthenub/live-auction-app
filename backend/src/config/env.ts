import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

function optional(key: string, defaultValue: string): string {
  const value = process.env[key];
  if (!value) console.warn(`Missing env var: ${key}, using default: ${defaultValue}`);
  return value || defaultValue;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),  // Render auto-provides this
  MONGO_URI: required("MONGO_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_ISSUER: optional("JWT_ISSUER", process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`),
  JWT_AUDIENCE: optional("JWT_AUDIENCE", process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`),
  CLOUDINARY_CLOUD_NAME: required("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: required("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: required("CLOUDINARY_API_SECRET"),
  REDIS_URL: optional("REDIS_URL", "redis://127.0.0.1:6379"),  // Dev only
  UPSTASH_REDIS_URL: required("UPSTASH_REDIS_URL"),
  RABBITMQ_URL: required("RABBITMQ_URL"),
};