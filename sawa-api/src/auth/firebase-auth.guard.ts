import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as admin from 'firebase-admin';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (isOptionalAuth) {
      // If no token is present, allow through without a user (anonymous).
      if (!token) {
        return true;
      }
      // Token found — verify it. If invalid, still allow through (don't let
      // a malformed token escalate to 401 on a public-contribution route).
      try {
        if (admin.apps.length) {
          const decodedToken = await admin.auth().verifyIdToken(token);
          // Only trust uid from the verified token, never from the body.
          request.user = { uid: decodedToken.uid };
        }
      } catch {
        // Silently ignore bad tokens on optional-auth routes.
      }
      return true;
    }

    // Fully protected route — require a valid token.
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    try {
      if (!admin.apps.length) {
        throw new UnauthorizedException('Firebase Admin not initialized');
      }
      const decodedToken = await admin.auth().verifyIdToken(token);
      request.user = decodedToken;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
