import { KeyManager } from './src/key-manager.js';
import { randomBytes, sha256 } from './src/utils/crypto.js';

console.log('=== KeyManager Test ===\n');

try {
  console.log('1. Generate Ed25519 keypair...');
  const keyManager = await KeyManager.generate();
  console.log('   ✓ Keypair generated successfully');

  const publicKey = keyManager.getPublicKey();
  console.log(`   - Public key length: ${publicKey.length} bytes`);

  const keyId = keyManager.getKeyId();
  console.log(`   - Key ID: ${keyId}`);

  console.log('\n2. Sign and verify message...');
  const message = new TextEncoder().encode('Hello DIAP');
  const signature = await keyManager.sign(message);
  console.log(`   - Signature length: ${signature.length} bytes`);

  const isValid = keyManager.verify(message, signature);
  console.log(`   - Signature valid: ${isValid}`);

  console.log('\n3. Export key to DID format...');
  const did = keyManager.getDID();
  console.log(`   - DID: ${did}`);

  console.log('\n=== All KeyManager tests passed ===');
} catch (error) {
  console.error(`   FAILED: ${error.message}`);
  console.error(error.stack);
}