import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export const FIREBASE_APP = 'FIREBASE_APP';

export const FirebaseAdminProvider: Provider = {
  provide: FIREBASE_APP,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const projectId = configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!admin.apps.length && projectId && clientEmail && privateKey) {
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    return admin.apps.length > 0 ? admin.apps[0] : null;
  },
};
