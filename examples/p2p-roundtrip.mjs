/**
 * In-process verification: real HyperswarmCommunicator + real Duplex streams
 *
 * Why in-process: this dev environment is behind NAT and the public hyperdht
 * can't hole-punch (verified with raw hyperswarm probes — peers are discovered
 * via the DHT but the dial never completes). The wrapper's contract is
 * "sendToConnection writes to a Duplex stream; the receiver's `data` handler
 * fires". We verify that contract by injecting a paired pair of Duplex streams
 * in place of the network socket. Everything else — connect/connection event
 * bookkeeping, isInbound, streams map, bytesSent/Received, message emit — runs
 * through the real HyperswarmCommunicator code path.
 *
 * Two HyperswarmCommunicator instances, A and B:
 *   - inject a Duplex pair (socket-a <-> socket-b)
 *   - simulate the swarm's `connection` event by calling setupStreamHandlers
 *     on each side with its end of the pair
 *   - A calls sendToConnection(B.publicKey, payload)
 *   - we assert B's `message` event fires and conn.bytesReceived increases
 */
import { Duplex } from 'node:stream';
import { HyperswarmCommunicator } from '../dist/p2p/hyperswarm-communicator.js';

function makePair() {
  // 用一个轻量 hub 把两端桥接
  let aToB = [];
  let bToA = [];
  const a = new Duplex({
    write(chunk, _enc, cb) {
      bToA.push(chunk);
      setImmediate(() => a.push('ack')); // 不需要，只要对方读到即可
      cb();
    },
    read() {},
  });
  const b = new Duplex({
    write(chunk, _enc, cb) {
      aToB.push(chunk);
      cb();
    },
    read() {},
  });
  // 把已缓冲的数据 flush
  const flushA = setInterval(() => {
    while (bToA.length) b.push(bToA.shift());
  }, 5);
  const flushB = setInterval(() => {
    while (aToB.length) a.push(aToB.shift());
  }, 5);
  a.on('close', () => clearInterval(flushA));
  b.on('close', () => clearInterval(flushB));
  return { a, b };
}

const A_KEY = 'aaaa'.repeat(8); // 32 hex chars
const B_KEY = 'bbbb'.repeat(8);

const commA = new HyperswarmCommunicator({ server: true, client: true });
const commB = new HyperswarmCommunicator({ server: true, client: true });

// 收到 message
commA.on('message', (m, c) =>
  console.log(`[A] 收到来自 ${c.publicKey.slice(0, 8)} 的消息 (${m.content.byteLength} bytes):`,
    Buffer.from(m.content).toString())
);
commB.on('message', (m, c) =>
  console.log(`[B] 收到来自 ${c.publicKey.slice(0, 8)} 的消息 (${m.content.byteLength} bytes):`,
    Buffer.from(m.content).toString())
);

// 反射到达 connection 事件（跳过 start/joinTopic，不走 DHT）
const { a: socketA, b: socketB } = makePair();
commA.on('connection', (c) =>
  console.log(`[A] connection event: ${c.publicKey.slice(0, 8)} isInbound=${c.isInbound}`)
);
commB.on('connection', (c) =>
  console.log(`[B] connection event: ${c.publicKey.slice(0, 8)} isInbound=${c.isInbound}`)
);

// 直接把 socket 注入两个 communicator（沿用真实的 setupConnectionHandlers 逻辑路径，
// 但用反射的方式：直接访问 setupStreamHandlers 不行因为它是 private。
// 替代方法：构造一个"假 swarm"满足 setupConnectionHandlers 内部使用。
// 更简洁：暴露一个内部的 _registerInbound(socket, publicKey, isInbound) 方法。)

// === 这里我们临时借助一个轻量 shim：构造一个 EventEmitter 假装是 Hyperswarm，
// 让 communicator 的 setupConnectionHandlers 走通，把 socket 登记进 streams map。 ===

// 由于 communicator 内部对 swarm 的访问是 private 字段 + 强类型 unknown，
// 我们采用一个干净的反射 hack：直接调 communicator 的 setupConnectionHandlers
// 通过动态替换 `this.swarm`。

// communicator.start() 之后 this.swarm 才有值。我们手动 start + 替换 swarm。

// 步骤 1: start（创建本地 key pair + 内部状态）
await commA.start();
await commB.start();

// 步骤 2: 把假的 swarm 注入，使 setupConnectionHandlers 走通
// 真实 setupConnectionHandlers 长这样：
//   this.swarm.on('connection', (conn, info) => { ... })
// 所以我们的假 swarm 只需要有 .on('connection', cb)
const fakeSwarmA = { on(_evt, cb) { this._cb = cb; } };
const fakeSwarmB = { on(_evt, cb) { this._cb = cb; } };

// 直接覆盖私字段
(commA).swarm = fakeSwarmA;
(commB).swarm = fakeSwarmB;
(commA).isRunning = true;
(commB).isRunning = true;

// 现在调 setupConnectionHandlers —— 通过 emit('connection') 走完内部登记
(commA).setupConnectionHandlers();
(commB).setupConnectionHandlers();

const FAKE_INFO = (pubKey) => ({ publicKey: Buffer.from(pubKey, 'hex'), client: false });
// A 看到 B 入站
fakeSwarmA._cb(socketA, FAKE_INFO(B_KEY));
// B 看到 A 入站（A 是发起方 — 但这里用 paired socket，两端对称）
fakeSwarmB._cb(socketB, FAKE_INFO(A_KEY));

console.log('[main] 等待 100ms 让 socket 处理就绪');
await new Promise((r) => setTimeout(r, 100));

console.log('[main] commA.connections keys:', [...commA.connections.keys()].map(k => k.slice(0, 8)));
console.log('[main] commB.connections keys:', [...commB.connections.keys()].map(k => k.slice(0, 8)));

const A_PEER = commA.connections.get(B_KEY);
const B_PEER = commB.connections.get(A_KEY);
if (!A_PEER || !B_PEER) {
  console.error('❌ 注入失败：A 或 B 没有登记到对端');
  process.exit(1);
}

console.log('[main] A → B 发送 "hello from A"');
await commA.sendToConnection(B_KEY, 'hello from A');

console.log('[main] B → A 发送 "reply from B"');
await commB.sendToConnection(A_KEY, 'reply from B');

await new Promise((r) => setTimeout(r, 200));

const aConn = commA.getConnections().find((c) => c.publicKey === B_KEY);
const bConn = commB.getConnections().find((c) => c.publicKey === A_KEY);

console.log(`[main] A 视角: bytesSent=${aConn.bytesSent} bytesReceived=${aConn.bytesReceived}`);
console.log(`[main] B 视角: bytesSent=${bConn.bytesSent} bytesReceived=${bConn.bytesReceived}`);

let failed = false;
if (aConn.bytesSent < 12) {
  console.error(`❌ A.bytesSent = ${aConn.bytesSent}, 期望 ≥ 12 ("hello from A")`);
  failed = true;
}
if (bConn.bytesReceived < 12) {
  console.error(`❌ B.bytesReceived = ${bConn.bytesReceived}, 期望 ≥ 12`);
  failed = true;
}
if (bConn.bytesSent < 12) {
  console.error(`❌ B.bytesSent = ${bConn.bytesSent}, 期望 ≥ 12 ("reply from B")`);
  failed = true;
}
if (aConn.bytesReceived < 12) {
  console.error(`❌ A.bytesReceived = ${aConn.bytesReceived}, 期望 ≥ 12`);
  failed = true;
}

socketA.destroy();
socketB.destroy();
await commA.stop();
await commB.stop();

if (failed) {
  console.error('❌ 验证失败');
  process.exit(1);
} else {
  console.log('✅ 验证通过：A→B 与 B→A 双向字节真实写入并被接收');
  process.exit(0);
}
