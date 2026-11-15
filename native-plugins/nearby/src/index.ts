import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export type NearbyPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'prompt-with-rationale'
  | 'limited'
  | 'unknown';

export type NearbyPermissionAlias =
  | 'bluetooth'
  | 'nearbyWifi'
  | 'microphone'
  | 'locationCoarse'
  | 'locationFine';

export type NearbyPermissionValue =
  | NearbyPermissionState
  | boolean
  | { granted?: boolean; state?: NearbyPermissionState };

export interface NearbyPermissionStatus {
  bluetooth?: NearbyPermissionValue;
  nearbyWifi?: NearbyPermissionValue;
  microphone?: NearbyPermissionValue;
  locationCoarse?: NearbyPermissionValue;
  locationFine?: NearbyPermissionValue;
}

interface NearbyEventBase {
  endpointId?: string;
}

export type NearbyEvent =
  | (NearbyEventBase & {
      type: 'STARTED' | 'STOPPED';
    })
  | (NearbyEventBase & {
      type: 'DEVICE_FOUND' | 'DEVICE_CONNECTED' | 'DEVICE_LOST';
      deviceName?: string;
      serviceId?: string;
    })
  | (NearbyEventBase & {
      type: 'MESSAGE_RECEIVED';
      senderName?: string;
      text: string;
      messageId?: string | null;
      protocolVersion?: number;
      timestamp?: number;
    })
  | (NearbyEventBase & {
      type: 'CONNECTION_REQUESTED';
      deviceName?: string;
      authToken?: string | null;
    })
  | (NearbyEventBase & {
      type: 'TRANSFER_UPDATE';
      /** Identifiant 64 bits : transmis en chaîne pour éviter toute perte de précision en JavaScript. */
      payloadId: string;
      status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELED' | 'UNKNOWN';
      bytesTransferred: number;
      totalBytes?: number;
      direction?: 'incoming' | 'outgoing';
      fileName?: string;
      mimeType?: string;
    })
  | (NearbyEventBase & {
      type: 'FILE_RECEIVED';
      payloadId: string;
      senderName?: string;
      fileName: string;
      mimeType: string;
      size: number;
      /** Chemin du fichier enregistré dans le stockage de l'application. */
      path: string;
      timestamp?: number;
    })
  | (NearbyEventBase & {
      type: 'CALL_STATE';
      callId: string;
      media: 'audio' | 'video';
      state: 'ringing_in' | 'ringing_out' | 'active';
      incoming: boolean;
      deviceName?: string;
    })
  | (NearbyEventBase & {
      type: 'CALL_ENDED';
      callId: string;
      reason: 'local' | 'remote' | 'rejected' | 'busy' | 'timeout' | 'lost' | 'error';
    })
  | (NearbyEventBase & {
      type: 'VIDEO_FRAME';
      callId: string;
      /** Image JPEG encodée en base64. */
      data: string;
    })
  | (NearbyEventBase & {
      type: 'ERROR';
      message: string;
    });

export type NearbyFileKind = 'image' | 'video' | 'document';

export interface NearbyPickedFile {
  cancelled: boolean;
  uri?: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

export interface NearbyVoiceRecording {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  durationMs: number;
  path: string;
}

export interface NearbyChatPlugin {
  start(options: { displayName: string }): Promise<{ success: boolean; alreadyStarted?: boolean }>;
  stop(): Promise<{ success: boolean }>;
  send(options: { text: string; endpointId?: string; messageId?: string; protocolVersion?: number }): Promise<{ success: boolean; sentTo: number; messageId?: string }>;
  requestConnection(options: { endpointId: string }): Promise<{ success: boolean; alreadyConnected?: boolean }>;
  accept(options: { endpointId: string; authenticationConfirmed: true }): Promise<{ success: boolean }>;
  reject(options: { endpointId: string }): Promise<{ success: boolean }>;
  pickFile(options: { kind: NearbyFileKind }): Promise<NearbyPickedFile>;
  sendFile(options: { uri: string; endpointId?: string }): Promise<{
    success: boolean;
    payloadId: string;
    endpointId: string;
    fileName: string;
    mimeType: string;
    size: number;
  }>;
  cancelTransfer(options: { payloadId: string }): Promise<{ success: boolean }>;
  openFile(options: { path: string; mimeType?: string }): Promise<{ success: boolean }>;
  startVoiceRecording(): Promise<{ success: boolean; maxDurationMs: number }>;
  stopVoiceRecording(): Promise<NearbyVoiceRecording>;
  cancelVoiceRecording(): Promise<{ success: boolean }>;
  startCall(options: { media: 'audio' | 'video'; endpointId?: string }): Promise<{ success: boolean; callId: string }>;
  answerCall(options: { callId: string; accept: boolean }): Promise<{ success: boolean }>;
  endCall(): Promise<{ success: boolean }>;
  setCallMuted(options: { muted: boolean }): Promise<{ success: boolean }>;
  setCallSpeaker(options: { enabled: boolean }): Promise<{ success: boolean }>;
  sendVideoFrame(options: { data: string }): Promise<{ success: boolean }>;
  getAndroidSdkVersion(): Promise<{ sdkVersion: number }>;
  getRequiredPermissionAliases(): Promise<{ permissions: NearbyPermissionAlias[] }>;
  checkPermissions(): Promise<NearbyPermissionStatus>;
  requestPermissions(options?: { permissions?: NearbyPermissionAlias[] }): Promise<NearbyPermissionStatus>;
  getConnectedDevices(): Promise<{
    success: boolean;
    devices: Record<string, string>;
    count: number;
  }>;
  addListener(
    eventName: 'nearbyEvent',
    listenerFunc: (event: NearbyEvent) => void
  ): Promise<PluginListenerHandle>;
}

const NearbyChat = registerPlugin<NearbyChatPlugin>('NearbyChat', {
  web: () => Promise.resolve({} as NearbyChatPlugin),
});

export { NearbyChat };
