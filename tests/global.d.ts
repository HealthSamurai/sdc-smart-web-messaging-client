import type {QuestionnaireContext, SdcConfigureRequest, SdcUiChangedFocusPayload,} from "sdc-smart-web-messaging-client";
import type {SmartMessagingPhase} from "../src/phase";

type HostMessage = {
  messageType?: string;
  messageId?: string;
  responseToMessageId?: string;
  payload?: Record<string, any>;
};

type HostApi = {
  sendRequest: (messageType: string, payload: unknown) => string;
  sendResponse: (messageType: string, responseToMessageId: string, payload: unknown) => string;
  getMessages: () => HostMessage[];
  clearMessages: () => void;
};

type RendererState = {
  questionnaire: fhir4.Questionnaire | null;
  questionnaireResponse: fhir4.QuestionnaireResponse | null;
  context: QuestionnaireContext | null;
  config: SdcConfigureRequest["payload"] | null;
  phase: SmartMessagingPhase;
  phaseName?: string;
};

type RendererActions = {
  onQuestionnaireResponseChange: (response: fhir4.QuestionnaireResponse) => void;
  onFocusChange: (payload: SdcUiChangedFocusPayload) => void;
};

type RendererEvents = {
  errors: Array<{ messageType?: string; message?: string }>;
  extractRequests: unknown[];
};

declare global {
  interface Window {
    __host?: HostApi;
    __messages?: HostMessage[];
    __rendererState?: RendererState;
    __rendererActions?: RendererActions;
    __rendererEvents?: RendererEvents;
  }
}

export {};
