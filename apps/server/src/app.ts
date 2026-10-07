import { Server, WebSocketTransport } from 'colyseus'
import { OfficeRoom } from './rooms/OfficeRoom'

export function createServer() {
  // The default 4 KB message cap is too small for the WebRTC session descriptions relayed when a call starts.
  const server = new Server({ transport: new WebSocketTransport({ maxPayload: 256 * 1024 }) })
  server.define('office', OfficeRoom)
  return server
}
