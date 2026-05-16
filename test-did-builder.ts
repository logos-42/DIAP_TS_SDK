import { KeyManager } from './src/key-manager.js';
import { encryptPeerId } from './src/libp2p/encrypted-peer-id.js';
import { encodeBase58 } from './src/utils/encoding.js';

console.log('=== DID Builder Manual Test ===\n');

try {
  console.log('1. Generate keypair...');
  const keypair = KeyManager.generate();
  console.log('   ✓ Keypair generated');
  console.log(`   - DID: ${keypair.did}`);

  console.log('\n2. Encrypt PeerID...');
  const peerId = 'QmTestPeerId123456789';
  const encryptedPeerId = encryptPeerId(keypair.privateKey, peerId);
  console.log('   ✓ PeerID encrypted');
  console.log(`   - Method: ${encryptedPeerId.method}`);
  console.log(`   - Ciphertext length: ${encryptedPeerId.ciphertext.length}`);

  console.log('\n3. Build DID document manually...');
  const publicKeyMultibase = 'z' + encodeBase58(keypair.publicKey);
  console.log('   ✓ Public key multibase:', publicKeyMultibase.substring(0, 25) + '...');

  console.log('\n=== DID Builder tests passed ===');
} catch (error) {
  console.error(`   FAILED: ${error.message}`);
  console.error(error.stack);
}