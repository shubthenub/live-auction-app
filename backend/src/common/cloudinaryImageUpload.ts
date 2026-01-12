import cloudinary from '../config/cloudinary.js';

export async function cloudinaryImageUpload(
  buffer: Buffer,
  folder = 'auctions'
): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            return reject(error);
          }
          resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
}
