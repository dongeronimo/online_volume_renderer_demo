export const rootEventsTarget = new EventTarget();

// Optional: Type-safe event helpers
export const dispatchRenderEvent = (eventName: string, detail: any) => {
  rootEventsTarget.dispatchEvent(new CustomEvent(eventName, { detail }));
};

export const listenToRenderEvent = (eventName: string, handler: (detail: any) => void) => {
  const wrappedHandler = (e: Event) => {
    handler((e as CustomEvent).detail);
  };
  rootEventsTarget.addEventListener(eventName, wrappedHandler);
  return () => rootEventsTarget.removeEventListener(eventName, wrappedHandler);
};