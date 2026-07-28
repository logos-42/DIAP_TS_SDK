/**
 * 全局类型声明
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module '@libp2p/interface-peer-id' {
  export interface PeerId {
    toString(): string;
    toBytes(): Uint8Array;
  }
}

declare module '@libp2p/interface-connection' {
  export interface Connection {
    remotePeer: PeerId;
    remoteAddr: Multiaddr;
    remoteAddrProtocols: string[];
    close(): Promise<void>;
  }
  export interface Multiaddr {
    toString(): string;
    toBytes(): Uint8Array;
    toArray(): Multiaddr[];
  }
  export interface PeerId {
    toString(): string;
    toBytes(): Uint8Array;
  }
}

declare module '@libp2p/interface-pubsub' {
  export interface PubSub {
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    publish(topic: string, data: Uint8Array): Promise<void>;
    on(event: string, handler: (topic: string, msg: any) => void): void;
    addEventListener(event: string, handler: (evt: any) => void): void;
    removeEventListener(event: string, handler: (evt: any) => void): void;
  }
}

declare module '@chainsafe/libp2p-gossipsub' {
  export interface Gossipsub extends PubSub {
    addPeer(peerId: any, protocol: string): void;
    removePeer(peerId: any): void;
  }
  export function gossipsub(init?: any): Gossipsub;
  export interface PubSub {
    start(): Promise<void>;
    stop(): Promise<void>;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    publish(topic: string, data: Uint8Array): Promise<void>;
    on(event: string, handler: (topic: string, msg: any) => void): void;
    addEventListener(event: string, handler: (evt: any) => void): void;
    removeEventListener(event: string, handler: (evt: any) => void): void;
  }
}

declare module 'libp2p' {
  export interface Libp2pOptions {
    peerId?: any;
    addresses?: any;
    connectionManager?: any;
    transports?: any[];
    streamMuxers?: any[];
    connectionEncryption?: any[];
    datastore?: any;
    pubsub?: any;
    services?: any;
    peerDiscovery?: any[];
    [key: string]: any;
  }
  export interface Connection {
    remotePeer: any;
    remoteAddr: {
      toString(): string;
      toBytes(): Uint8Array;
      toArray(): { toString(): string }[];
    };
    remoteAddrProtocols: string[];
    close(): Promise<void>;
  }
  export class Libp2p {
    constructor(options?: Libp2pOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    dial(peer: any): Promise<Connection>;
    hangUp(peer: any): Promise<void>;
    peerStore: any;
    multiaddrs: any;
    getPeers(): any[];
    isStarted(): boolean;
    services?: any;
    peerId?: any;
    addEventListener(event: string, handler: (evt: any) => void): void;
    removeEventListener(event: string, handler: any): void;
    getMultiaddrs(): any[];
  }
  export function createLibp2p(options?: Libp2pOptions): Promise<Libp2p>;
}

declare module '@multiformats/multiaddr' {
  export class Multiaddr {
    constructor(addr: string | Uint8Array);
    toString(): string;
    toBytes(): Uint8Array;
    toArray(): Multiaddr[];
  }
  export function multiaddr(addr: string | Uint8Array): Multiaddr;
}

declare module '@libp2p/interface-connection' {
  export interface Connection {
    remotePeer: PeerId;
    remoteAddr: Multiaddr;
    remoteAddrProtocols: string[];
    close(): Promise<void>;
  }
  export interface Multiaddr {
    toString(): string;
    toBytes(): Uint8Array;
    toArray(): Multiaddr[];
  }
  export interface PeerId {
    toString(): string;
    toBytes(): Uint8Array;
  }
}

declare module '@libp2p/interface-connection' {
  export interface Connection {
    remotePeer: PeerId;
    remoteAddr: Multiaddr;
    remoteAddrProtocols: string[];
    close(): Promise<void>;
  }
  export interface Multiaddr {
    toString(): string;
    toBytes(): Uint8Array;
    toArray(): Multiaddr[];
  }
  export interface PeerId {
    toString(): string;
    toBytes(): Uint8Array;
  }
}

declare module '@libp2p/tcp' {
  export function tcp(): any;
}

declare module '@libp2p/websockets' {
  export function webSockets(): any;
}

declare module '@libp2p/webrtc-star' {
  export function webRTCStar(): any;
}

declare module '@libp2p/mplex' {
  const mplex: any;
  export = mplex;
}

declare module '@libp2p/noise' {
  const noise: any;
  export = noise;
}

declare module '@libp2p/identify' {
  export function identify(): any;
}

declare module '@libp2p/gater' {
  export function gater(options?: any): any;
}

declare module '@libp2p/mdns' {
  export function mdns(options?: any): any;
}

declare module '@libp2p/bootstrap' {
  export function bootstrap(options?: any): any;
}

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
  export * from './sha2.js';
  export * from './blake2.js';
  export * from './blake2s.js';
}

declare module '@noble/hashes/sha256' {
  export function sha256(message: Uint8Array | string): Uint8Array;
  export function sha512(message: Uint8Array | string): Uint8Array;
}

declare module '@noble/hashes/sha2' {
  export function sha256(message: Uint8Array | string): Uint8Array;
  export function sha512(message: Uint8Array | string): Uint8Array;
}

declare module '@noble/hashes/blake2' {
  export function blake2b(message: Uint8Array | string, outputLength?: number | { dkLen?: number }): Uint8Array;
  export function blake2s(message: Uint8Array | string, outputLength?: number | { dkLen?: number }): Uint8Array;
}

declare module '@noble/hashes/blake2.js' {
  export * from '@noble/hashes/blake2';
}

declare module '@noble/hashes/sha2.js' {
  export * from '@noble/hashes/sha2';
}

declare module '@noble/hashes/blake2s' {
  export function blake2s(message: Uint8Array | string, outputLength?: number): Uint8Array;
}

// 声明 bs58 模块
declare module 'bs58' {
  export function encode(input: Uint8Array | string): string;
  export function decode(input: string): Uint8Array;
}

// 声明 @iroh-js/client 模块
declare module '@iroh-js/client' {
  export class Endpoint {
    static builder(): EndpointBuilder;
    nodeId(): Promise<{ toString(): string }>;
    connect(peerId: any, addr?: string): Promise<any>;
    close(): Promise<void>;
    onIncomingConnection(handler: (conn: any) => void): void;
  }
  export class EndpointBuilder {
    bind(): Promise<Endpoint>;
    dataDir(dir: string): this;
    addRelay(relay: string): this;
    enableNatTraversal(): this;
  }
}

// 声明 hyperswarm 模块
declare module 'hyperswarm' {
  export default class Hyperswarm {
    constructor(options?: Record<string, unknown>);
    join(topic: Buffer, options?: Record<string, unknown>): {
      refresh: (opts?: { server?: boolean; client?: boolean }) => Promise<void>;
      flushed: () => Promise<void>;
      destroy: () => Promise<void>;
    };
    leave(topic: Buffer): void;
    destroy(): void;
    on(event: string, callback: (conn: unknown, info: unknown) => void): void;
  }
}

// 声明 snarkjs 模块
declare module 'snarkjs' {
  const groth16: {
    fullProve(
      input: any,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: any; publicSignals: any }>;
    verify(vKey: any, publicSignals: any, proof: any): Promise<boolean>;
  };
  const plonk: {
    fullProve(
      input: any,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{ proof: any; publicSignals: any }>;
    verify(vKey: any, publicSignals: any, proof: any): Promise<boolean>;
  };
  function exportSolidityVerifier(vKey: any, options?: Record<string, unknown>): Promise<string>;
  const zkey: {
    loadZKey(path: string): Promise<any>;
  };
  const zkevm: {
    exportSolidityVerifier(vKey: any, options?: Record<string, unknown>): Promise<string>;
  };

  export { groth16, plonk, zkey, zkevm, exportSolidityVerifier };
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
  const CID: {
    parse(cid: string): CID;
    encode(version: number, codec: string, multihash: any): CID;
  };
  export { CID };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
