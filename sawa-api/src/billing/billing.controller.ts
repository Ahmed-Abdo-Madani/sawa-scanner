import { Controller, Post, Body, Request } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Public } from '../auth/public.decorator';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Retrieves or creates a unique account token (UUID) for the authenticated Firebase user.
   * This UUID is passed to App Store purchase transactions as appAccountToken.
   */
  @Post('account-token')
  async getOrCreateAccountToken(@Request() req: any) {
    const firebaseUid = req.user.uid;
    const accountToken = await this.billingService.getOrCreateAccountToken(firebaseUid);
    return { accountToken };
  }

  /**
   * App Store Server-to-Server Webhook receiver.
   * Receives notifications from Apple regarding subscription status changes.
   */
  @Public()
  @Post('apple/webhook')
  async handleAppleWebhook(@Body() body: { signedPayload: string }) {
    await this.billingService.handleAppleNotification(body);
    return { success: true };
  }
}
