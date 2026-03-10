import { useEffect, useRef } from 'react';
import type { UIToSandboxMessage, SandboxToUIMessage } from '../../shared/messageTypes';

/**
 * Post a message to the Figma plugin sandbox.
 */
export function postToPlugin(message: UIToSandboxMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

/**
 * Hook to listen for messages from the Figma plugin sandbox.
 * The handler is kept stable via useRef so that the event listener
 * does not need to be re-attached on every render.
 */
export function usePluginMessage(handler: (msg: SandboxToUIMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg && msg.type) {
        handlerRef.current(msg as SandboxToUIMessage);
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);
}
