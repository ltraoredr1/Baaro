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
  | 'locationCoarse'
  | 'locationFine';

export type NearbyPermissionValue =
  | NearbyPermissionState
  | boolean
  | { granted?: boolean; state?: NearbyPermissionState };

export interface NearbyPermissionStatus {
  bluetooth?: NearbyPermissionValue;
  nearbyWifi?: NearbyPermissionValue;
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
      payloadId: number;
      status: 'IN_PROGRESS' | 'SUCCESS';
      bytesTransferred: number;
      totalBytes?: number;
    })
  | (NearbyEventBase & {
      type: 'ERROR';
      message: string;
    });

export interface NearbyChatPlugin {
  start(options: { displayName: string }): Promise<{ success: boolean; alreadyStarted?: boolean }>;
  stop(): Promise<{ success: boolean }>;
  send(options: { text: string; endpointId?: string; messageId?: string; protocolVersion?: number }): Promise<{ success: boolean; sentTo: number; messageId?: string }>;
  requestConnection(options: { endpointId: string }): Promise<{ success: boolean; alreadyConnected?: boolean }>;
  accept(options: { endpointId: string; authenticationConfirmed: true }): Promise<{ success: boolean }>;
  reject(options: { endpointId: string }): Promise<{ success: boolean }>;
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
