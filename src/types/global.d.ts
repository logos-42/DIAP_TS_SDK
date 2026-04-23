/**
 * 全局类型声明
 */

// 声明 @noble/ed25519 模块
declare module '@noble/ed25519' {
  export function getPublicKey(privateKey: Uint8Array): Uint8Array;
  export function sign(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>;
  export function signSync(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  export function verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
  ): Promise<boolean>;
  export function verifySync(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
  ): boolean;

  export namespace utils {
    export function randomPrivateKey(): Uint8Array;
  }
}

// 声明 @noble/hashes 模块
declare module '@noble/hashes' {
  export * from './sha256.js';
  export * from './blake2.js';
}

declare module '@noble/hashes/sha256' {
  export function sha256(message: Uint8Array | string): Uint8Array;
  export function sha512(message: Uint8Array | string): Uint8Array;
}

declare module '@noble/hashes/blake2' {
  export function blake2b(message: Uint8Array | string, outputLength?: number): Uint8Array;
  export function blake2s(message: Uint8Array | string, outputLength?: number): Uint8Array;
}

// 声明 bs58 模块
declare module 'bs58' {
  export function encode(input: Uint8Array | string): string;
  export function decode(input: string): Uint8Array;
}

// 声明 hyperswarm 模块
declare module 'hyperswarm' {
  export default class Hyperswarm {
    constructor(options?: any);
    join(topic: Buffer, options?: any): { update: () => void };
    leave(topic: Buffer): void;
    connect(peerKey: Buffer): {
      on: (event: string, cb: Function) => void;
      write: (data: Buffer) => void;
    };
    destroy(): void;
    on(event: string, callback: (conn: any, info: any) => void): void;
  }
}

// 声明 snarkjs 模块
declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: any,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: any; publicSignals: any }>;
    verify(vKey: any, publicSignals: any, proof: any): Promise<boolean>;
  };
  export const plonk: {
    fullProve(
      input: any,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: any; publicSignals: any }>;
    verify(vKey: any, publicSignals: any, proof: any): Promise<boolean>;
  };
  export const zkey: {
    loadZKey(path: string): Promise<any>;
  };
  export const zkevm: {
    exportSolidityVerifier(vKey: any, options?: any): Promise<string>;
  };
  export function exportSolidityVerifier(vKey: any, options?: any): Promise<string>;
}

// 声明 multiformats/cid 模块
declare module 'multiformats/cid' {
  export interface CID {
    version: number;
    codec: string;
    multihash: {
      code: number;
      digest: Uint8Array;
    };
    toString(): string;
    toV1(): CID;
  }
  export function parse(cid: string): CID;
  export function encode(version: number, codec: string, multihash: any): CID;
}
