const fs = require('fs');
const axios = require('axios');
const path = require('path');

class BunnyService {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.storageZoneName = config.storageZoneName;
    this.pullZone = config.pullZone;
    this.region = config.region || ''; // '' (DE), 'ny', 'la', 'sg', 'syd'
  }

  isConfigured() {
    return !!(this.apiKey && this.storageZoneName && this.pullZone);
  }

  getBaseUrl() {
    if (this.region && this.region !== 'de') {
      return `https://${this.region}.storage.bunnycdn.com`;
    }
    return 'https://storage.bunnycdn.com';
  }

  /**
   * Upload a file to BunnyCDN
   * @param {string} localFilePath - Path to file on disk
   * @param {string} filename - Target filename
   * @returns {Promise<string>} - The public URL of the uploaded file
   */
  async uploadFile(localFilePath, filename) {
    if (!this.isConfigured()) {
      throw new Error('BunnyCDN is not configured');
    }

    const fileStream = fs.createReadStream(localFilePath);
    const url = `${this.getBaseUrl()}/${this.storageZoneName}/${filename}`;

    try {
      await axios.put(url, fileStream, {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': 'application/octet-stream', // Bunny auto-detects or we can pass it if mapped
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      // Return the Pull Zone URL
      // Ensure pullZone doesn't have trailing slash
      const baseUrl = this.pullZone.replace(/\/$/, '');
      return `${baseUrl}/${filename}`;
    } catch (error) {
      console.error('BunnyCDN upload error:', error.message);
      throw error;
    }
  }

  /**
   * Delete a file from BunnyCDN
   * @param {string} filename - The filename to delete
   */
  async deleteFile(filename) {
    if (!this.isConfigured()) return;

    const url = `${this.getBaseUrl()}/${this.storageZoneName}/${filename}`;
    try {
      await axios.delete(url, {
        headers: {
          AccessKey: this.apiKey,
        },
      });
    } catch (error) {
      console.error('BunnyCDN delete error:', error.message);
      // Don't throw, just log
    }
  }
}

module.exports = { BunnyService };
