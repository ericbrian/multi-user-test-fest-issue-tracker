/**
 * Storage Service Abstraction
 * Supports Local Disk and AWS S3 backends
 */

const fs = require("fs");
const path = require("path");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

class StorageService {
  /**
   * @param {string} filename
   * @returns {Promise<string>} - Returns the URL or path to be stored in DB
   */
  async uploadFile(file) {
    throw new Error("uploadFile not implemented");
  }

  /**
   * @param {string} fileUrlOrPath - The value stored in DB (e.g., /uploads/foo.jpg)
   * @returns {Promise<void>}
   */
  async deleteFile(fileUrlOrPath) {
    throw new Error("deleteFile not implemented");
  }

  /**
   * @param {string} filename
   * @returns {Promise<ReadableStream>}
   */
  async getFileStream(filename) {
    throw new Error("getFileStream not implemented");
  }
}

/**
 * Local Disk Implementation
 */
class DiskStorageService extends StorageService {
  constructor(uploadsDir) {
    super();
    this.uploadsDir = uploadsDir;
  }

  async uploadFile(file) {
    // Multer has already handled the disk write if we use diskStorage
    // This method might be used for manual moves or just returning the path
    return `/uploads/${file.filename}`;
  }

  async deleteFile(fileUrlOrPath) {
    if (!fileUrlOrPath || !fileUrlOrPath.startsWith("/uploads/")) return;

    const filename = path.basename(fileUrlOrPath);
    const fullPath = path.join(this.uploadsDir, filename);

    return new Promise((resolve) => {
      fs.unlink(fullPath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.error("Error deleting local file:", err);
        }
        resolve();
      });
    });
  }

  async getFileStream(filename) {
    const fullPath = path.join(this.uploadsDir, filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error("File not found");
    }
    return fs.createReadStream(fullPath);
  }
}

/**
 * AWS S3 Implementation
 */
class S3StorageService extends StorageService {
  constructor(config) {
    super();
    this.bucket = config.bucket;
    this.region = config.region;
    this.s3Client = new S3Client({
      region: this.region,
      // If keys are provided, use them; otherwise, assume IAM role (IRSA)
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async uploadFile(file) {
    const filename = `${Date.now()}-${file.originalname}`;
    const fileStream = fs.createReadStream(file.path);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: `uploads/${filename}`,
        Body: fileStream,
        ContentType: file.mimetype,
      },
    });

    await upload.done();

    // After uploading to S3, we can delete the local temp file
    fs.unlink(file.path, (err) => {
      if (err) console.error("Error deleting temp file after S3 upload:", err);
    });

    return `/uploads/${filename}`;
  }

  async deleteFile(fileUrlOrPath) {
    if (!fileUrlOrPath || !fileUrlOrPath.startsWith("/uploads/")) return;

    const filename = path.basename(fileUrlOrPath);
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: `uploads/${filename}`,
    });

    try {
      await this.s3Client.send(command);
    } catch (err) {
      console.error("Error deleting file from S3:", err);
    }
  }

  async getFileStream(filename) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: `uploads/${filename}`,
    });

    const response = await this.s3Client.send(command);
    return response.Body;
  }
}

/**
 * Factory to create storage service based on config
 */
function createStorageService(config) {
  if (config.backend === "s3") {
    return new S3StorageService({
      bucket: config.s3Bucket,
      region: config.s3Region,
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    });
  }
  return new DiskStorageService(config.uploadsDir);
}

module.exports = {
  StorageService,
  DiskStorageService,
  S3StorageService,
  createStorageService,
};
