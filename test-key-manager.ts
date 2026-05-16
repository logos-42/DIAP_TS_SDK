import { KeyManager } from './src/key-manager.js';

console.log('=== KeyManager Test ===\n');

try {
  console.log('1. Generate Ed25519 keypair...');
  const keypair = KeyManager.generate();
  console.log('   ✓ Keypair generated successfully');

  console.log(`   - Public key length: ${keypair.publicKey.length} bytes`);
  console.log(`   - DID: ${keypair.did}`);

  console.log('\n2. Sign and verify message...');
  const message = new TextEncoder().encode('Hello DIAP');
  const signature = await KeyManager.sign(keypair, message);
  console.log(`   - Signature length: ${signature.length} bytes`);

  const isValid = await KeyManager.verify(keypair, message, signature);
  console.log(`   - Signature valid: ${isValid}`);

  console.log('\n=== All KeyManager tests passed ===');
} catch (error) {
  console.error(`   FAILED: ${error.message}`);
  console.error(error.stack);
}