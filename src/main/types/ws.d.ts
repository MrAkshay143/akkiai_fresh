declare module 'ws' {
  import { EventEmitter } from 'events';
  import { Server as HttpServer } from 'http';

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    static CLOSED: number;
    static CLOSING: number;
    static CONNECTING: number;
    readyState: number;
    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string): void;
  }

  export interface ServerOptions {
    server?: HttpServer;
    port?: number;
    host?: string;
    path?: string;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: ServerOptions);
    clients: Set<WebSocket>;
    close(cb?: (err?: Error) => void): void;
  }

  export default WebSocket;
}
