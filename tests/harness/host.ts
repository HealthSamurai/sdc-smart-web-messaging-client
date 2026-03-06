type HostMessage = Record<string, unknown> & {
  messageType?: string;
  messageId?: string;
  responseToMessageId?: string;
};

type HostApi = {
  sendRequest: (messageType: string, payload: unknown) => string;
  sendResponse: (messageType: string, responseToMessageId: string, payload: unknown) => string;
  getMessages: () => HostMessage[];
  clearMessages: () => void;
};

const iframe = document.querySelector<HTMLIFrameElement>("#renderer");
if (!iframe) {
  throw new Error("Renderer iframe not found.");
}

const messagingHandle = "test-handle";
const messagingOrigin = window.location.origin;
const rendererPath = new URLSearchParams(window.location.search).get("renderer") || "/renderer.html";

iframe.src = `${rendererPath}?messaging_handle=${encodeURIComponent(
  messagingHandle,
)}&messaging_origin=${encodeURIComponent(messagingOrigin)}`;

const messages: HostMessage[] = [];

const postToRenderer = (message: HostMessage) => {
  iframe.contentWindow?.postMessage(message, messagingOrigin);
};

const randomId = () => Math.random().toString(36).slice(2, 10);

window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  messages.push(event.data as HostMessage);
});

const hostApi: HostApi = {
  sendRequest: (messageType, payload) => {
    const message = {
      messagingHandle,
      messageId: randomId(),
      messageType,
      payload,
    };
    postToRenderer(message);
    return message.messageId;
  },
  sendResponse: (messageType, responseToMessageId, payload) => {
    const message = {
      messagingHandle,
      messageId: randomId(),
      messageType,
      responseToMessageId,
      payload,
    };
    postToRenderer(message);
    return message.messageId;
  },
  getMessages: () => [...messages],
  clearMessages: () => {
    messages.length = 0;
  },
};

(window as typeof window & { __host?: HostApi; __messages?: HostMessage[] }).__host =
  hostApi;
(window as typeof window & { __host?: HostApi; __messages?: HostMessage[] }).__messages =
  messages;
