import "dotenv/config";

export const cloudBucketConfig = {
  endPoint: process.env.CLOUD_ENDPOINT as string,
  port: parseInt(process.env.CLOUD_PORT ?? "9000", 10),
  useSSL: process.env.CLOUD_USE_SSL === "true",
  accessKey: process.env.CLOUD_ACCESS_KEY as string,
  secretKey: process.env.CLOUD_SECRET_KEY as string,
  bucketName: process.env.CLOUD_BUCKET_NAME as string,
};

export const fileUploadSettings = {
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE ?? "10485760", 10),
  allowedExtensions: (process.env.ALLOWED_EXTENSIONS ?? "").split(","),
};
