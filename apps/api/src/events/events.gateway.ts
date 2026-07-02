import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { WsCampaignUpdate } from '@marketingspa/shared';

export interface WsLeadNewPayload {
  leadId: string;
  name: string;
  pipelineStatus: string;
}

export interface WsAppointmentNewPayload {
  appointmentId: string;
  scheduledAt: string;
  customerName?: string;
}

export interface WsLeadStalePayload {
  count: number;
  leads: { id: string; name: string; createdAt: string }[];
}

export interface WsLeadStatusChangedPayload {
  leadId: string;
  name: string;
  previousStatus: string;
  pipelineStatus: string;
}

/** Socket.IO gateway — realtime theo organization room */
@WebSocketGateway({
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const orgId = client.handshake.query.organizationId as string | undefined;
    if (orgId) {
      client.join(`org:${orgId}`);
    }
  }

  handleDisconnect(_client: Socket) {
    // Room cleanup tự động bởi Socket.IO
  }

  /** Public for RealtimeBridgeService */
  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`org:${organizationId}`).emit(event, payload);
  }

  private broadcastToOrg(organizationId: string, event: string, payload: unknown) {
    this.emitToOrg(organizationId, event, payload);
  }

  broadcastCampaignUpdate(organizationId: string, payload: WsCampaignUpdate) {
    this.broadcastToOrg(organizationId, 'campaign:update', payload);
  }

  broadcastLeadNew(organizationId: string, payload: WsLeadNewPayload) {
    this.broadcastToOrg(organizationId, 'lead:new', payload);
  }

  broadcastAppointmentNew(organizationId: string, payload: WsAppointmentNewPayload) {
    this.broadcastToOrg(organizationId, 'appointment:new', payload);
  }

  broadcastLeadStaleAlert(organizationId: string, payload: WsLeadStalePayload) {
    this.broadcastToOrg(organizationId, 'lead:stale-alert', payload);
  }

  broadcastLeadStatusChanged(organizationId: string, payload: WsLeadStatusChangedPayload) {
    this.broadcastToOrg(organizationId, 'lead:status-changed', payload);
  }
}
