/**
 * 全局类型声明
 */

// 声明 @noble/ed25519 模块
declare module '@noble/ed25519' {
  export function getPublicKey(privateKey: Uint8Array): Uint8Array;
  export function sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
  export function signSync(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean>;
  export function verifySync(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;

  export namespace utils {
    export function randomPrivateKey(): Uint8Array;
  }
}

// 声明 hyperswarm 模块
declare module 'hyperswarm' {
  export default class Hyperswarm {
    constructor(options?: any);
    join(topic: Buffer, options?: any): void;
    leave(topic: Buffer): void;
    connect(peerKey: Buffer): Promise<any>;
    destroy(): void;
    on(event: string, callback: (conn: any, info: any) => void): void;
  }
}

// 声明 snarkjs 模块
declare module 'snarkjs' {
  export const groth16: {
    fullProve(input: any, wasmPath: string, zkeyPath: string): Promise<{ proof: any; publicSignals: any }>;
    verify(vKey: any, publicSignals: any, proof: any): Promise<boolean>;
  };
  export const plonk: {
    fullProve(input: any, wasmPath: string, zkeyPath: string): Promise<{ proof: any; publicSignals: any }>;
    verify(vKey: any, publicSignals: any, proof: any): Promise<boolean>;
  };
}