import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocalStorageState } from './useLocalStorageState.js';

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;

export function useSidebarLayout() {
  const [width, setWidth] = useLocalStorageState('ttymux.sidebarWidth', DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useLocalStorageState('ttymux.sidebarCollapsed', false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const startResize = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      const startX = event.clientX;
      const startWidth = width;

      function onMouseMove(moveEvent: MouseEvent) {
        if (!draggingRef.current) return;
        setDragWidth(clamp(startWidth + (moveEvent.clientX - startX)));
      }

      function onMouseUp(upEvent: MouseEvent) {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setWidth(clamp(startWidth + (upEvent.clientX - startX)));
        setDragWidth(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [width, setWidth],
  );

  return {
    width: dragWidth ?? width,
    isResizing: dragWidth !== null,
    collapsed,
    toggleCollapsed: () => setCollapsed((prev) => !prev),
    startResize,
  };
}

function clamp(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}
