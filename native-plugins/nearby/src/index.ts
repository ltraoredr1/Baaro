import { registerPlugin } from '@capacitor/core';

export interface NearbyChatPlugin {
  start(options: { displayName: string }): Promise<{ success: boolean }>;
  stop(): Promise<{ success: boolean }>;
  send(options: { text: string; endpointId?: string }): Promise<{ success: boolean }>;
  accept(options: { endpointId: string }): Promise<{ success: boolean }>;
  reject(options: { endpointId: string }): Promise<{ success: boolean }>;
  checkPermissions(): Promise<{ nearby: string; location: string }>;
  requestPermissions(): Promise<{ nearby: string; location: string }>;
  addListener(
    eventName: 'nearbyEvent',
    listenerFunc: (event: NearbyEvent) => void
  ): Promise<PluginListenerHandle>;
}

export interface NearbyEvent {
  type:
    | 'DEVICE_FOUND'
    | 'DEVICE_CONNECTED'
    | 'DEVICE_LOST'
    | 'MESSAGE_RECEIVED'
    | 'CONNECTION_REQUESTED'
    | 'ERROR';
  endpointId?: string;
  deviceName?: string;
  senderName?: string;
  text?: string;
  serviceId?: string;
  message?: string;
}

export interface PluginListenerHandle {
  remove: () => void;
}

const NearbyChat = registerPlugin<NearbyChatPlugin>('NearbyChat', {
  web: () => Promise.resolve({} as any),
});

export { NearbyChat };
