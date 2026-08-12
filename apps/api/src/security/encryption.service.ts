import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppConfig } from '../config/app-config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * AES-256-GCM encryption for secrets at rest. Payload format:
 * `iv:authTag:ciphertext` (base64). Authenticated encryption: any tampering
 * or wrong-key decryption throws.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = Buffer.from(config.env.ENCRYPTION_KEY, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    const [ivBase64, tagBase64, dataBase64] = parts as [string, string, string, ...string[]];
    if (parts.length !== 3 || !ivBase64 || !tagBase64 || !dataBase64) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    try {
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataBase64, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new Error('Decryption failed: payload is tampered or the key is wrong');
    }
  }
}
