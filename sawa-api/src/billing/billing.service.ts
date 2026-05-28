import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription } from '../entities/user-subscription.entity';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepository: Repository<UserSubscription>,
  ) {}

  /**
   * Retrieves or creates a unique UUID account token for the logged-in Firebase user.
   */
  async getOrCreateAccountToken(firebaseUid: string): Promise<string> {
    let sub = await this.subscriptionRepository.findOne({ where: { firebaseUid } });
    if (!sub) {
      sub = this.subscriptionRepository.create({ firebaseUid, status: 'expired' });
      sub = await this.subscriptionRepository.save(sub);
      this.logger.log(`Created new subscription UUID mapping for user ${firebaseUid}: ${sub.id}`);
    }
    return sub.id;
  }

  /**
   * Set custom claims on Firebase Auth to allow client-side offline subscription validation.
   */
  async updateFirebaseCustomClaim(firebaseUid: string, isSubscribed: boolean): Promise<void> {
    try {
      if (admin.apps.length > 0) {
        await admin.auth().setCustomUserClaims(firebaseUid, { sawaPlus: isSubscribed });
        this.logger.log(`Updated Firebase claims for ${firebaseUid}: sawaPlus=${isSubscribed}`);
      } else {
        this.logger.warn(`Firebase Admin not initialized, cannot set claims for ${firebaseUid}`);
      }
    } catch (e) {
      this.logger.error(`Failed to set Firebase claims for ${firebaseUid}: ${e.message}`);
    }
  }

  /**
   * Processes the App Store Connect Server-to-Server Webhook Notification (v2).
   */
  async handleAppleNotification(payload: { signedPayload: string }): Promise<void> {
    const signedPayload = payload.signedPayload;
    if (!signedPayload) {
      throw new Error('Missing signedPayload in webhook request');
    }

    const verifySignature = process.env.VERIFY_APPLE_SIGNATURE === 'true';

    // Verify root notification JWS signature
    if (verifySignature && !this.verifyJWSSignature(signedPayload)) {
      throw new Error('Invalid Apple signedPayload signature');
    }

    const notification = this.decodeJWSPayload(signedPayload);
    this.logger.log(`Received App Store notification: ${notification.notificationType}`);

    const data = notification.data;
    if (!data || !data.signedTransactionInfo) {
      throw new Error('Missing transaction info in payload');
    }

    // Verify transaction JWS signature
    if (verifySignature && !this.verifyJWSSignature(data.signedTransactionInfo)) {
      throw new Error('Invalid Apple signedTransactionInfo signature');
    }

    const transaction = this.decodeJWSPayload(data.signedTransactionInfo);

    const appAccountToken = transaction.appAccountToken; // UUID
    const originalTransactionId = transaction.originalTransactionId;
    const productId = transaction.productId;
    const expiresDate = transaction.expiresDate; // timestamp ms
    const purchaseDate = transaction.purchaseDate; // timestamp ms
    const revocationDate = transaction.revocationDate; // optional timestamp ms

    this.logger.log(
      `Processing transaction: appAccountToken=${appAccountToken}, originalTxId=${originalTransactionId}, expiresDate=${expiresDate}`,
    );

    let sub: UserSubscription | null = null;

    // Look up by appAccountToken UUID first
    if (appAccountToken) {
      sub = await this.subscriptionRepository.findOne({ where: { id: appAccountToken } });
    }

    // Fallback to lookup by originalTransactionId
    if (!sub && originalTransactionId) {
      sub = await this.subscriptionRepository.findOne({ where: { originalTransactionId } });
    }

    if (!sub) {
      this.logger.warn(
        `No subscription mapping found for appAccountToken=${appAccountToken} or originalTransactionId=${originalTransactionId}`,
      );
      return;
    }

    // Determine state
    let status = 'expired';
    const now = Date.now();

    if (revocationDate) {
      status = 'revoked';
    } else if (expiresDate && expiresDate > now) {
      status = 'active';
    } else if (
      notification.notificationType === 'SUBSCRIBED' ||
      notification.notificationType === 'DID_RENEW'
    ) {
      status = 'active';
    } else if (notification.notificationType === 'EXPIRED') {
      status = 'expired';
    }

    sub.originalTransactionId = originalTransactionId;
    sub.productId = productId;
    sub.status = status;
    sub.expiresAt = expiresDate ? new Date(expiresDate) : null;
    sub.purchaseDate = purchaseDate ? new Date(purchaseDate) : null;
    await this.subscriptionRepository.save(sub);

    const isSubscribed = status === 'active';
    await this.updateFirebaseCustomClaim(sub.firebaseUid, isSubscribed);

    this.logger.log(
      `Subscription updated in DB for user ${sub.firebaseUid}: status=${status}, isSubscribed=${isSubscribed}`,
    );
  }

  /**
   * Helper to base64url-decode the payload of a JWS token.
   */
  private decodeJWSPayload(jws: string): any {
    const parts = jws.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWS format');
    }
    const payloadBase64Url = parts[1];
    const base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  }

  /**
   * Helper to verify a JWS signature using Node's native crypto module.
   */
  private verifyJWSSignature(jws: string): boolean {
    try {
      const parts = jws.split('.');
      if (parts.length !== 3) return false;
      const [headerB64, payloadB64, signatureB64] = parts;

      // Extract certificate chain (x5c) from the header
      const header = JSON.parse(
        Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
      );
      if (!header.x5c || !header.x5c.length) {
        return false;
      }

      // Convert the DER certificate to PEM format
      const certDer = Buffer.from(header.x5c[0], 'base64');
      const certBase64 = certDer.toString('base64');
      const lines = certBase64.match(/.{1,64}/g);
      if (!lines) {
        return false;
      }
      const publicKeyPem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;

      const signature = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

      const verify = crypto.createVerify('sha256');
      verify.update(`${headerB64}.${payloadB64}`);
      return verify.verify(publicKeyPem, signature);
    } catch (e) {
      this.logger.error(`JWS signature verification error: ${e.message}`);
      return false;
    }
  }
}
