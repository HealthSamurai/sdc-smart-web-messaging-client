import type {
  SdcEventPayload,
  SdcMessageType,
  SdcRequestPayload,
  SdcResponsePayload,
  SmartWebMessagingEvent,
  SmartWebMessagingRequest,
  SmartWebMessagingResponse,
} from "sdc-smart-web-messaging";

export type AnyOutgoingMessage =
  | SmartWebMessagingRequest<unknown>
  | SmartWebMessagingResponse<unknown>;

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

type MessengerOptions = {
  messagingHandle: string | null;
  messagingOrigin: string | null;
  hostWindow: Window | null;
};

export function createMessenger(options: MessengerOptions) {
  const { messagingHandle, messagingOrigin, hostWindow } = options;

  const postToHost = (message: AnyOutgoingMessage) => {
    if (!hostWindow || !messagingOrigin) return;
    hostWindow.postMessage(message, messagingOrigin);
  };

  const sendEvent = <TPayload extends SdcEventPayload>(
    messageType: SdcMessageType,
    payload: TPayload,
  ) => {
    if (!messagingHandle) return;
    const message = {
      messagingHandle,
      messageId: randomId(),
      messageType,
      payload,
    } as SmartWebMessagingEvent<TPayload>;
    postToHost(message);
  };

  const sendRequest = <TPayload extends SdcRequestPayload>(
    messageType: SdcMessageType,
    payload: TPayload,
  ) => {
    if (!messagingHandle) return;
    const message = {
      messagingHandle,
      messageId: randomId(),
      messageType,
      payload,
    } as SmartWebMessagingRequest<TPayload>;
    postToHost(message);
  };

  const sendResponse = <TPayload extends SdcResponsePayload>(
    messageType: SdcMessageType,
    responseToMessageId: string,
    payload: TPayload,
  ) => {
    if (!messagingHandle) return;
    const message = {
      messagingHandle,
      messageId: randomId(),
      messageType,
      responseToMessageId,
      payload,
    } as SmartWebMessagingResponse<TPayload>;
    postToHost(message);
  };

  return { sendEvent, sendRequest, sendResponse };
}
