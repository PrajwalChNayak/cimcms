import { cloudBucketConfig, fileUploadSettings } from "@utils/config.utils";
import { ValidationError } from "@utils/errors/custom.errors";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Client as MinioClient } from "minio";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldNameDetail {
  name: string;
  maxCount: number;
  folderName: string;
  isOptional: boolean;
  ownerId?: string | number;
}

export interface UploadedFileInfo {
  fileName: string;
  folderName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Singleton — one TCP connection pool for the entire process lifetime
const bucketClient = new MinioClient(cloudBucketConfig);

// Pre-computed MB divisor — avoids repeated arithmetic in error messages
const BYTES_TO_MB = 1024 * 1024;

// Multer instance created once at module load, not per-request
const _multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: fileUploadSettings.maxFileSize || Infinity },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = fileUploadSettings.allowedExtensions;
    if (allowed.length === 0 || allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
}).any();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises multer's flat File[] (from .any()) into a fieldname-keyed Map.
 * Map lookup is O(1) vs repeated Array.filter O(n) per field.
 */
function groupFilesByField(
  rawFiles: Express.Multer.File[] | undefined,
): Map<string, Express.Multer.File[]> {
  const map = new Map<string, Express.Multer.File[]>();
  if (!rawFiles) return map;

  for (const file of rawFiles) {
    const bucket = map.get(file.fieldname);
    if (bucket) {
      bucket.push(file);
    } else {
      map.set(file.fieldname, [file]);
    }
  }
  return map;
}

/**
 * Uploads a single file buffer to MinIO and returns the stored filename.
 * On failure the orphaned object is cleaned up before re-throwing.
 */
async function uploadToStorage(
  folderName: string,
  file: Express.Multer.File,
  metaData: Record<string, string>,
  ownerId?: string | number,
): Promise<string> {
  const uniqueFileName = `${uuidv4()}_${file.originalname.replace(/\s+/g, "_")}`;
  const objectPath = ownerId
    ? `${folderName}/${ownerId}/${uniqueFileName}`
    : `${folderName}/${uniqueFileName}`;

  try {
    await bucketClient.putObject(
      cloudBucketConfig.bucketName,
      objectPath,
      file.buffer,
      file.size,
      metaData,
    );
    return uniqueFileName;
  } catch (error) {
    await bucketClient.removeObject(cloudBucketConfig.bucketName, objectPath);
    throw new Error((error as Error).message);
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Parses multipart/form-data and stores files in memory (req.files).
 * Does NOT upload anything — that happens in the service layer via
 * uploadFilesToStorage.
 */
export const parseMultipart: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  _multerUpload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File "${error.field}" exceeds the ${fileUploadSettings.maxFileSize / BYTES_TO_MB} MB limit.`
          : "File upload error.";
      next(new ValidationError(message));
    } else if (error) {
      next(error);
    } else {
      next();
    }
  });
};

// ─── Service-layer upload ─────────────────────────────────────────────────────

/**
 * Validates field requirements and uploads accepted files to MinIO.
 * Called from the service layer — keeps Express out of business logic.
 *
 * Set `ownerId` on each FieldNameDetail to scope files under
 * folderName/ownerId/fileName.
 *
 * Time:  O(F + N)  — F field configs, N total files
 * Space: O(F + N)  — grouped map + result record
 */
export const uploadFilesToStorage = async (
  rawFiles: Express.Multer.File[] | undefined,
  fieldConfigs: FieldNameDetail[],
): Promise<Record<string, UploadedFileInfo[]>> => {
  const fileMap = groupFilesByField(rawFiles);

  // ── Validation (single pass over fieldConfigs) ───────────────────────
  const missing: string[] = [];
  const exceeded: string[] = [];

  for (const field of fieldConfigs) {
    const files = fileMap.get(field.name);
    if (!files) {
      if (!field.isOptional) missing.push(field.name);
    } else if (files.length > field.maxCount) {
      exceeded.push(field.name);
    }
  }

  if (missing.length)
    throw new ValidationError(`Required fields missing: ${missing.join(", ")}`);
  if (exceeded.length)
    throw new ValidationError(
      `File count exceeded for: ${exceeded.join(", ")}`,
    );

  // ── Upload (all fields concurrently) ─────────────────────────────────
  const result: Record<string, UploadedFileInfo[]> = {};

  await Promise.all(
    fieldConfigs.map(async (field) => {
      const files = fileMap.get(field.name);
      if (!files) return;

      const storedFolder = field.ownerId
        ? `${field.folderName}/${field.ownerId}`
        : field.folderName;

      result[field.name] = await Promise.all(
        files.map(async (file) => {
          const fileName = await uploadToStorage(
            field.folderName,
            file,
            { "Content-type": file.mimetype },
            field.ownerId,
          );
          return { fileName, folderName: storedFolder };
        }),
      );
    }),
  );

  return result;
};
