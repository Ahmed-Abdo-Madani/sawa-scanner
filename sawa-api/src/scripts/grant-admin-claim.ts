import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials in .env');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const args = process.argv.slice(2);
  let uid = '';
  let email = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--uid' && args[i + 1]) {
      uid = args[i + 1];
      i++;
    } else if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1];
      i++;
    }
  }

  if (!uid && !email) {
    console.log('Usage: npx ts-node src/scripts/grant-admin-claim.ts --uid <uid> OR --email <email>');
    process.exit(1);
  }

  try {
    let userRecord: admin.auth.UserRecord;
    if (email) {
      console.log(`Resolving UID for email: ${email}...`);
      userRecord = await admin.auth().getUserByEmail(email);
      uid = userRecord.uid;
    } else {
      userRecord = await admin.auth().getUser(uid);
    }

    console.log(`Granting admin claim to user: ${userRecord.email || uid}...`);
    
    const currentClaims = userRecord.customClaims || {};
    const newClaims = { ...currentClaims, admin: true };
    
    await admin.auth().setCustomUserClaims(uid, newClaims);
    
    const updatedUser = await admin.auth().getUser(uid);
    console.log('Success! Resulting claims:', updatedUser.customClaims);
    console.log('NOTE: The user must re-sign-in or refresh their ID token for changes to take effect.');

  } catch (error) {
    console.error('Error granting admin claim:', error.message);
    process.exit(1);
  }
}

main();
