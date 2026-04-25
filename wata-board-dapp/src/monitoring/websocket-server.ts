/**
 * WebSocket Server for Real-time Monitoring
 * Provides real-time monitoring data to connected clients
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { MonitoringService, MonitoringEventListener } from './monitoring-service';
import { MonitoringEvent } from '../../../shared/monitoring-types';

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  lastPing: number;
  subscriptions: Set<string>;
}

export class MonitoringWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private monitoringService: MonitoringService;
  private heartbeatInterval: any = null;
  private port: number;
  private path: string;

  constructor(
    monitoringService: MonitoringService,
    port: number = 3002,
    path: string = '/monitoring'
  ) {
    this.port = port;
    this.path = path;
    this.monitoringService = monitoringService;
    
    // Create HTTP server for WebSocket
    const server = createServer();
    this.wss = new WebSocketServer({ 
      server,
      path: this.path
    });

    this.setupWebSocketServer();
    this.setupHeartbeat();
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss.on('connection', (ws: WebSocket, request) => {
          this.handleConnection(ws, request);
        });

        this.wss.on('error', (error) => {
          console.error('WebSocket server error:', error);
          reject(error);
        });

        server.listen(this.port, () => {
          console.log(`🔌 Monitoring WebSocket server listening on port ${this.port}`);
          console.log(`📡 WebSocket path: ${this.path}`);
          resolve();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Close all client connections
      this.clients.forEach((client) => {
        client.ws.close();
      });
      this.clients.clear();

      this.wss.close(() => {
        console.log('WebSocket server stopped');
        resolve();
      });
    });
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    const client: WebSocketClient = {
      id: clientId,
      ws,
      lastPing: Date.now(),
      subscriptions: new Set(['health', 'performance', 'business', 'alerts'])
    };

    this.clients.set(clientId, client);

    console.log(`📱 Client connected: ${clientId} from ${request.socket.remoteAddress}`);

    // Send initial data
    this.sendInitialData(client);

    // Setup event handlers
    ws.on('message', (data: any) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      this.handleDisconnection(client);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      this.handleDisconnection(client);
    });

    // Subscribe to monitoring events
    this.monitoringService.addEventListener(this.createMonitoringListener(client));
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(client: WebSocketClient, data: any): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(client, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(client, message.data);
          break;
        case 'ping':
          this.handlePing(client);
          break;
        case 'getHistory':
          this.handleHistoryRequest(client, message.data);
          break;
        case 'resolveAlert':
          this.handleAlertResolution(client, message.data);
          break;
        default:
          this.sendError(client, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.sendError(client, 'Invalid message format');
    }
  }

  /**
   * Handle client subscription
   */
  private handleSubscription(client: WebSocketClient, data: any): void {
    if (data && Array.isArray(data.events)) {
      data.events.forEach((event: string) => {
        client.subscriptions.add(event);
      });
      this.sendSuccess(client, 'Subscribed to events');
    }
  }

  /**
   * Handle client unsubscription
   */
  private handleUnsubscription(client: WebSocketClient, data: any): void {
    if (data && Array.isArray(data.events)) {
      data.events.forEach((event: string) => {
        client.subscriptions.delete(event);
      });
      this.sendSuccess(client, 'Unsubscribed from events');
    }
  }

  /**
   * Handle ping message
   */
  private handlePing(client: WebSocketClient): void {
    client.lastPing = Date.now();
    this.sendToClient(client, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle history request
   */
  private handleHistoryRequest(client: WebSocketClient, data: any): void {
    try {
      const history = this.monitoringService.getHistory(data.type, data.limit);
      this.sendToClient(client, {
        type: 'history',
        data: history
      });
    } catch (error) {
      this.sendError(client, 'Failed to retrieve history');
    }
  }

  /**
   * Handle alert resolution
   */
  private handleAlertResolution(client: WebSocketClient, data: any): void {
    if (data.alertId) {
      const success = this.monitoringService.resolveAlert(data.alertId);
      if (success) {
        this.sendSuccess(client, 'Alert resolved');
      } else {
        this.sendError(client, 'Failed to resolve alert');
      }
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(client: WebSocketClient): void {
    this.clients.delete(client.id);
    console.log(`📱 Client disconnected: ${client.id}`);
  }

  /**
   * Send initial data to newly connected client
   */
  private sendInitialData(client: WebSocketClient): void {
    const currentData = this.monitoringService.getCurrentData();
    this.sendToClient(client, {
      type: 'initial',
      data: currentData
    });
  }

  /**
   * Create monitoring event listener for client
   */
  private createMonitoringListener(client: WebSocketClient): MonitoringEventListener {
    return (event: MonitoringEvent) => {
      if (client.subscriptions.has(event.type) || client.subscriptions.has('all')) {
        this.sendToClient(client, {
          type: 'event',
          data: event
        });
      }
    };
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Failed to send message to client ${client.id}:`, error);
      }
    }
  }

  /**
   * Send success message
   */
  private sendSuccess(client: WebSocketClient, message: string): void {
    this.sendToClient(client, {
      type: 'success',
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send error message
   */
  private sendError(client: WebSocketClient, error: string): void {
    this.sendToClient(client, {
      type: 'error',
      error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Setup heartbeat interval
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client) => {
        // Remove inactive clients (no ping for 30 seconds)
        if (now - client.lastPing > 30000) {
          client.ws.close();
          return;
        }

        // Send ping to active clients
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(client, {
            type: 'ping',
            timestamp: new Date().toISOString()
          });
        }
      });
    }, 15000); // Every 15 seconds
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      port: this.port,
      path: this.path,
      uptime: Date.now() - (this as any).startTime
    };
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: any): void {
    this.clients.forEach((client) => {
      this.sendToClient(client, message);
    });
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}
