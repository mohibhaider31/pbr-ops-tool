"use client";

import { useEffect, useRef } from "react";
import Pusher from "pusher-js";

// Subscribes to a poker channel and invokes handlers on events. Reconnects
// are handled by pusher-js. One shared Pusher instance per page.
let shared: Pusher | null = null;
function client(): Pusher {
  if (!shared) {
    shared = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return shared;
}

export function usePokerChannel(
  code: string | null,
  handlers: Record<string, (data: any) => void>
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!code) return;
    const ch = client().subscribe(`poker-${code}`);
    const bound: string[] = [];
    for (const event of Object.keys(handlersRef.current)) {
      const fn = (data: any) => handlersRef.current[event]?.(data);
      ch.bind(event, fn);
      bound.push(event);
    }
    return () => {
      for (const e of bound) ch.unbind(e);
      client().unsubscribe(`poker-${code}`);
    };
  }, [code]);
}
