import { useEffect, useRef, useState } from 'react';
import type { PortInfo, SerialSettings, ViewerInfo, WriteTokenState } from '@ttymux/shared';
import { base64ToBytes, bytesToBase64 } from '../api/base64.js';
import { connectConsoleSocket, generateClientId } from '../api/client.js';

const EMPTY_WRITE_TOKEN: WriteTokenState = { holder: null, freeForAll: false };

export interface UseConsoleSocketResult {
  connected: boolean;
  clientId: string;
  port: PortInfo | null;
  viewers: ViewerInfo[];
  writeToken: WriteTokenState;
  isWriter: boolean;
  controlDeniedReason: string | null;
  requestControl: () => void;
  releaseControl: () => void;
  changeSettings: (settings: Partial<SerialSettings>) => void;
  setFreeForAll: (enabled: boolean) => void;
  sendInput: (data: Uint8Array) => void;
}

export interface ConsoleDataHandlers {
  /** Sent once per attach (including re-attach after a drop) with the full current backlog — replace, don't append. */
  onScrollback: (bytes: Uint8Array) => void;
  onOutput: (bytes: Uint8Array) => void;
}

export function useConsoleSocket(portId: string, dataHandlers: ConsoleDataHandlers, displayName?: string): UseConsoleSocketResult {
  const clientIdRef = useRef<string | null>(null);
  if (!clientIdRef.current) clientIdRef.current = generateClientId();
  const clientId = clientIdRef.current;

  const handleRef = useRef<ReturnType<typeof connectConsoleSocket> | null>(null);
  const dataHandlersRef = useRef(dataHandlers);
  dataHandlersRef.current = dataHandlers;

  const [connected, setConnected] = useState(false);
  const [port, setPort] = useState<PortInfo | null>(null);
  const [viewers, setViewers] = useState<ViewerInfo[]>([]);
  const [writeToken, setWriteToken] = useState<WriteTokenState>(EMPTY_WRITE_TOKEN);
  const [controlDeniedReason, setControlDeniedReason] = useState<string | null>(null);

  useEffect(() => {
    setPort(null);
    setViewers([]);
    setWriteToken(EMPTY_WRITE_TOKEN);
    setControlDeniedReason(null);

    const handle = connectConsoleSocket(portId, clientId, {
      displayName,
      onConnectionChange: setConnected,
      onMessage: (message) => {
        switch (message.type) {
          case 'scrollback':
            dataHandlersRef.current.onScrollback(base64ToBytes(message.dataBase64));
            break;
          case 'output':
            dataHandlersRef.current.onOutput(base64ToBytes(message.dataBase64));
            break;
          case 'status':
            setPort(message.port);
            break;
          case 'viewers':
            setViewers(message.viewers);
            break;
          case 'writerChanged':
            setWriteToken(message.writeToken);
            break;
          case 'controlDenied':
            setControlDeniedReason(message.reason);
            break;
          case 'error':
          case 'pong':
            break;
        }
      },
    });
    handleRef.current = handle;

    return () => {
      handle.close();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portId, displayName]);

  return {
    connected,
    clientId,
    port,
    viewers,
    writeToken,
    isWriter: writeToken.holder === clientId,
    controlDeniedReason,
    requestControl: () => handleRef.current?.send({ type: 'requestControl' }),
    releaseControl: () => handleRef.current?.send({ type: 'releaseControl' }),
    changeSettings: (settings) => handleRef.current?.send({ type: 'changeSettings', settings }),
    setFreeForAll: (enabled) => handleRef.current?.send({ type: 'setFreeForAll', enabled }),
    sendInput: (data) => handleRef.current?.send({ type: 'input', dataBase64: bytesToBase64(data) }),
  };
}
