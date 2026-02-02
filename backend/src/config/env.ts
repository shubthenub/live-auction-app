import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  MONGO_URI: required("MONGO_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_ISSUER: required("JWT_ISSUER"),
  JWT_AUDIENCE: required("JWT_AUDIENCE"),
  CLOUDINARY_CLOUD_NAME: required("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: required("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: required("CLOUDINARY_API_SECRET"),
  REDIS_URL: required("REDIS_URL"),
  RABBITMQ_URL: required("RABBITMQ_URL"),
};
