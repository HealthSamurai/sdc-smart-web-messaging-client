import type {
  QuestionnaireContext,
  SdcConfigureRequest,
  SdcMessageType,
  SdcRequestExtractRequest,
  SdcRequestExtractResponse,
  SdcUiChangedFocusPayload,
  SdcUiChangedQuestionnaireResponsePayload,
} from "sdc-smart-web-messaging";
import type {SmartMessagingPhase} from "./phase";

export type SmartMessagingOptions = {
  application: {
    name: string;
    publisher?: string;
    version?: string;
  };
  capabilities?: {
    extraction?: boolean;
    focusChangeNotifications?: boolean;
  };
  onRequestExtract?: (
    payload: SdcRequestExtractRequest["payload"],
  ) => Promise<SdcRequestExtractResponse["payload"]> | SdcRequestExtractResponse["payload"];
  onError?: (error: SmartMessagingError) => void;
};

export type SmartMessagingWindowOptions = {
  window?: Window | null;
  hostWindow?: Window | null;
  messagingHandle?: string | null;
  messagingOrigin?: string | null;
};

export type SmartMessagingError = {
  phase: SmartMessagingPhase;
  message: string;
  messageType?: SdcMessageType;
};

export type SmartMessagingState = {
  questionnaire: fhir4.Questionnaire | null;
  questionnaireResponse: fhir4.QuestionnaireResponse | null;
  context: QuestionnaireContext | null;
  config: SdcConfigureRequest["payload"] | null;
  fhirVersion: string | null;
  phase: SmartMessagingPhase;
};

export type SmartMessagingStateListener = (state: SmartMessagingState) => void;

export type { SmartMessagingPhase } from "./phase";
export type IncomingMessage = {
  messageId: string;
  messageType: string;
  payload: unknown;
};

export type SmartMessagingClient = {
  getState: () => SmartMessagingState;
  subscribe: (listener: SmartMessagingStateListener) => () => void;
  updateOptions: (options: SmartMessagingOptions) => void;
  handleMessage: (message: IncomingMessage) => void;
  onQuestionnaireResponseChange: (
    response: SdcUiChangedQuestionnaireResponsePayload["questionnaireResponse"],
  ) => void;
  onFocusChange: (payload: SdcUiChangedFocusPayload) => void;
  destroy: () => void;
};

export type CreateSmartMessagingClientOptions = SmartMessagingOptions & SmartMessagingWindowOptions;

export type UseSmartMessagingOptions = SmartMessagingOptions;

export type UseSmartMessagingResult = SmartMessagingState & {
  onQuestionnaireResponseChange: SmartMessagingClient["onQuestionnaireResponseChange"];
  onFocusChange: SmartMessagingClient["onFocusChange"];
};
