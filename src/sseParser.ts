export interface SseEvent {
  event: string;
  data: string;
}

function normalizeLineBreaks(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function parseSseEvents(payload: string): SseEvent[] {
  const lines = normalizeLineBreaks(payload);
  const events: SseEvent[] = [];
  let currentEvent = "message";
  let currentData: string[] = [];
  let hasEventFields = false;

  const pushEvent = (): void => {
    if (!hasEventFields && currentData.length === 0) {
      return;
    }
    events.push({
      event: currentEvent || "message",
      data: currentData.join("\n"),
    });
    currentEvent = "message";
    currentData = [];
    hasEventFields = false;
  };

  for (const line of lines) {
    if (line === "") {
      pushEvent();
      continue;
    }

    if (line.startsWith(":")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).replace(/^ /, "");

    if (field === "event") {
      currentEvent = value || "message";
      hasEventFields = true;
      continue;
    }

    if (field === "data") {
      currentData.push(value);
      hasEventFields = true;
      continue;
    }
  }

  if (currentEvent !== "message" || currentData.length > 0) {
    pushEvent();
  }

  return events;
}
