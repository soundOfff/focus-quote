// Preloaded into the demo API server (node --import). Any socket to a
// non-loopback host is refused and logged, so a stray provider call fails loudly.
import net from "node:net"

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", undefined])
const connect = net.Socket.prototype.connect

net.Socket.prototype.connect = function (...args) {
  const opts = typeof args[0] === "object" && args[0] !== null ? args[0] : { port: args[0], host: args[1] }
  if (!opts.path && !LOOPBACK.has(opts.host)) {
    console.error(`[egress] blocked ${opts.host}:${opts.port}`)
    process.nextTick(() => this.destroy(new Error(`demo egress blocked: ${opts.host}`)))
    return this
  }
  return connect.apply(this, args)
}

console.log("[egress] non-loopback sockets are blocked")
