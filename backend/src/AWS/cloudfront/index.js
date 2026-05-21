import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import fs from 'fs';
import { CLOUDFRONT_KEYPAIR_ID, CLOUDFRONT_PRIVATE_KEY } from '../../../config.js';

function resolvePrivateKey(value) {
  if (!value) {
    throw new Error('CLOUDFRONT_PRIVATE_KEY no está configurada');
  }
  return value.startsWith('/') || value.startsWith('.') ? fs.readFileSync(value) : value;
}

async function firmarUrl(url, expiresInSeconds = 86400) {
  try {
    const signedUrl = await getSignedUrl({
      url,
      dateLessThan: new Date(Date.now() + expiresInSeconds * 1000),
      privateKey: resolvePrivateKey(CLOUDFRONT_PRIVATE_KEY),
      keyPairId: CLOUDFRONT_KEYPAIR_ID,
    });

    return signedUrl;
  } catch (error) {
    console.error(error);
  }
}

export default firmarUrl;
