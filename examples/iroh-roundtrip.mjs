/**
 * IrohCommunicator 端到端字节环回验证（in-process）
 *
 * 不走真实 @number0/iroh 的 Iroh.memory() / QUIC（本地 native binary 损坏），
 * 直接向 communicator 注入伪造的 Endpoint + 配对的 BiStream，让 sendMessage
 * 写入的字节通过伪造的 RecvStream.readExact 出现在对端 message 事件里。
 *
 * 验证范围：
 *   - registerConnection 走通
 *   - 长度前缀帧协议两端一致
 *   - sendMessage → writeAll → 缓冲 → 对端 readExact → JSON.parse → emit('message')
 *   - bytesSent / bytesReceived 都正确累加
 *
 * 用法: node examples/iroh-roundtrip.mjs
 */
import { IrohCommunicator, IrohMessageType } from '../dist/p2p/iroh-communicator.js';

// === 构造一对"wire-pipe"：aToB / bToA 各一个内存队列 + 异步通知 ===
function makeWire() {
  let resolver = null;
  let queue = [];
  const wait = () => {
    if (queue.length > 0) {
      const v = queue.shift();
      return Promise.resolve(v);
    }
    return new Promise((r) => {
      resolver = (v) => {
        resolver = null;
        r(v);
      };
    });
  };
  const push = (v) => {
    if (resolver) {
      resolver(v);
    } else {
      queue.push(v);
    }
  };
  return { wait, push, close: () => resolver && resolver(null) };
}

// === 伪造的 SendStream / RecvStream，让 BiStream.send.writeAll(data) 把字节喂给
//     对端 RecvStream.readExact 的实现 ===
function makeSendStream(otherWire, sideLabel) {
  return {
    async writeAll(buf) {
      // 拷贝一份 Uint8Array，避免 caller 复用 buffer
      const copy = new Uint8Array(buf.byteLength);
      copy.set(buf);
      otherWire.push(copy);
    },
    async write(buf) {
      const copy = new Uint8Array(buf.byteLength);
      copy.set(buf);
      otherWire.push(copy);
      return BigInt(buf.byteLength);
    },
    async finish() {
      // 关闭对端
      otherWire.push(null);
    },
  };
}

function makeRecvStream(thisWire) {
  let closed = false;
  // 内部缓冲：readExact 拆帧用
  let buffer = new Uint8Array(0);
  const pullOne = async () => {
    if (closed) throw new Error('recv closed');
    const next = await thisWire.wait();
    if (next === null) {
      closed = true;
      throw new Error('EOF');
    }
    return next;
  };
  return {
    async readExact(buf) {
      while (buf.byteLength > buffer.byteLength) {
        const next = await pullOne();
        const merged = new Uint8Array(buffer.byteLength + next.byteLength);
        merged.set(buffer, 0);
        merged.set(next, buffer.byteLength);
        buffer = merged;
      }
      buf.set(buffer.subarray(0, buf.byteLength));
      buffer = buffer.subarray(buf.byteLength);
    },
    async read(buf) {
      if (buffer.byteLength === 0) {
        const next = await pullOne();
        buffer = next;
      }
      const n = Math.min(buf.byteLength, buffer.byteLength);
      buf.set(buffer.subarray(0, n));
      buffer = buffer.subarray(n);
      return BigInt(n);
    },
    async readToEnd(sizeLimit) {
      const chunks = [buffer];
      buffer = new Uint8Array(0);
      while (true) {
        const next = await pullOne();
        chunks.push(next);
      }
    },
  };
}

function makeBiStream(wireAtoB, wireBtoA, side) {
  // wireAtoB = A.send 推入 / B.recv 拉出
  // wireBtoA = B.send 推入 / A.recv 拉出
  const sendWire = side === 'A' ? wireAtoB : wireBtoA;
  const recvWire = side === 'A' ? wireBtoA : wireAtoB;
  return {
    send: makeSendStream(sendWire, side),
    recv: makeRecvStream(recvWire),
  };
}

const A_KEY = 'aa'.repeat(32);
const B_KEY = 'bb'.repeat(32);

const wireAtoB = makeWire();
const wireBtoA = makeWire();

const biA = makeBiStream(wireAtoB, wireBtoA, 'A');
const biB = makeBiStream(wireAtoB, wireBtoA, 'B');

const fakeConnAtoB = {
  remoteNodeId: () => B_KEY,
  openBi: async () => biA,
  acceptBi: async () => biA,
  close: () => {},
};
const fakeConnBtoA = {
  remoteNodeId: () => A_KEY,
  openBi: async () => biB,
  acceptBi: async () => biB,
  close: () => {},
};

const fakeEndpointA = {
  nodeId: () => A_KEY,
  connect: async (_addr, _alpn) => fakeConnAtoB,
};
const fakeEndpointB = {
  nodeId: () => B_KEY,
  connect: async (_addr, _alpn) => fakeConnBtoA,
};

const fakeNodeA = {
  net: {
    nodeId: async () => A_KEY,
    nodeAddr: async () => ({ nodeId: A_KEY }),
  },
  node: { endpoint: () => fakeEndpointA, shutdown: async () => {} },
};
const fakeNodeB = {
  net: {
    nodeId: async () => B_KEY,
    nodeAddr: async () => ({ nodeId: B_KEY }),
  },
  node: { endpoint: () => fakeEndpointB, shutdown: async () => {} },
};

// === 构造两个 IrohCommunicator，跳过 start()，直接注入 fake node/endpoint ===
const commA = new IrohCommunicator({ alpn: 'diap-v1', heartbeatIntervalMs: 0 });
const commB = new IrohCommunicator({ alpn: 'diap-v1', heartbeatIntervalMs: 0 });

commA.node = fakeNodeA;
commA.endpoint = fakeEndpointA;
commA.nodeId = A_KEY;
commA.isRunning = true;

commB.node = fakeNodeB;
commB.endpoint = fakeEndpointB;
commB.nodeId = B_KEY;
commB.isRunning = true;

// === 监听 message 事件 ===
commA.on('message', (msg, conn) =>
  console.log(
    `[A] 📨 收到 ${conn.remoteNodeId.slice(0, 8)} (${msg.messageType}, ${msg.content.length}B): ${msg.content}`
  )
);
commB.on('message', (msg, conn) =>
  console.log(
    `[B] 📨 收到 ${conn.remoteNodeId.slice(0, 8)} (${msg.messageType}, ${msg.content.length}B): ${msg.content}`
  )
);
commA.on('connection', (c) =>
  console.log(`[A] 🔗 connection event: ${c.remoteNodeId.slice(0, 8)} inbound=${c.inbound}`)
);
commB.on('connection', (c) =>
  console.log(`[B] 🔗 connection event: ${c.remoteNodeId.slice(0, 8)} inbound=${c.inbound}`)
);

// === A 主动 connectToNode(B)，使用伪造 endpoint 拿到 fakeConnAtoB，
//     registerConnection 会调 openBi() 拿到 biA；
//     但 B 这边没注册过 A 的连接！需要再手动调一次 handleIncomingConnection 吗？
//     简化：A 调 connectToNode(B) 之后，B 也"收到入站连接" -> 我们手动调
//     B 的内部方法 registerConnection（私有，但可绕过）。实际上 iroh 真实世界
//     是：protocols option 里的 accept 回调被 iroh 调用，B 拿到 Connection；
//     这里我们手动模拟"对端协议层送来了入站连接"。 ===
const connInfoA = await commA.connectToNode(B_KEY);
console.log(`[main] A→B 出站: inbound=${connInfoA.inbound} bytesSent=${connInfoA.bytesSent}`);

// 模拟 B 收到来自 A 的入站连接（绕过 iroh 协议层）
commB.registerConnection(A_KEY, fakeConnBtoA, biB, true);
const connInfoB = commB.getConnections().find((c) => c.remoteNodeId === A_KEY);
console.log(`[main] B 端入站: inbound=${connInfoB.inbound} bytesReceived=${connInfoB.bytesReceived}`);

// === 发几条消息验证 ===
const m1 = {
  messageId: 'm1',
  messageType: IrohMessageType.Custom,
  fromDid: A_KEY,
  content: 'hello from A',
  timestamp: Date.now(),
  metadata: {},
};
console.log(`[main] m1 JSON 长度: ${JSON.stringify(m1).length}`);
await commA.sendMessage(B_KEY, m1);
await new Promise((r) => setTimeout(r, 100));

const m2 = {
  messageId: 'm2',
  messageType: IrohMessageType.AuthRequest,
  fromDid: B_KEY,
  toDid: A_KEY,
  content: 'reply from B',
  timestamp: Date.now(),
  metadata: { foo: 'bar' },
};
console.log(`[main] m2 JSON 长度: ${JSON.stringify(m2).length}`);
await commB.sendMessage(A_KEY, m2);
await new Promise((r) => setTimeout(r, 100));

// === 检查 bytes 累加 ===
const finalA = commA.getConnections().find((c) => c.remoteNodeId === B_KEY);
const finalB = commB.getConnections().find((c) => c.remoteNodeId === A_KEY);
console.log(`\n[main] A 端 bytesSent=${finalA.bytesSent} bytesReceived=${finalA.bytesReceived}`);
console.log(`[main] B 端 bytesSent=${finalB.bytesSent} bytesReceived=${finalB.bytesReceived}`);

let failed = false;
// m1 body = JSON.stringify(m1).length + 4 字节前缀
// m2 body = JSON.stringify(m2).length + 4 字节前缀
// 期望 A 发出 m1: bytesSent 增加 frame1 大小
// 期望 A 收到 m2: bytesReceived 增加 frame2 大小
const m1FrameSize = JSON.stringify(m1).length + 4;
const m2FrameSize = JSON.stringify(m2).length + 4;
console.log(`[main] 期望: A.bytesSent >= ${m1FrameSize}, A.bytesReceived >= ${m2FrameSize}, B.bytesSent >= ${m2FrameSize}, B.bytesReceived >= ${m1FrameSize}`);

if (finalA.bytesSent < m1FrameSize) {
  console.error(`❌ A.bytesSent=${finalA.bytesSent}, 期望 ≥ ${m1FrameSize}`);
  failed = true;
}
if (finalA.bytesReceived < m2FrameSize) {
  console.error(`❌ A.bytesReceived=${finalA.bytesReceived}, 期望 ≥ ${m2FrameSize}`);
  failed = true;
}
if (finalB.bytesSent < m2FrameSize) {
  console.error(`❌ B.bytesSent=${finalB.bytesSent}, 期望 ≥ ${m2FrameSize}`);
  failed = true;
}
if (finalB.bytesReceived < m1FrameSize) {
  console.error(`❌ B.bytesReceived=${finalB.bytesReceived}, 期望 ≥ ${m1FrameSize}`);
  failed = true;
}

commA.connections.clear();
commB.connections.clear();
commA.isRunning = false;
commB.isRunning = false;

if (failed) {
  console.error('\n❌ 验证失败');
  process.exit(1);
} else {
  console.log('\n✅ 验证通过：A↔B 双向字节真实写入并被接收');
  process.exit(0);
}
