export * from "sdc-smart-web-messaging";
export {
  createSmartMessagingClient,
} from "./client";
export {
  getContextFromPayload,
  isDisplayQuestionnairePayload,
  isDisplayQuestionnaireResponsePayload,
  isQuestionnaire,
  isQuestionnaireContext,
  isQuestionnaireResponse,
  isRecord,
  isSdcConfigureContextPayload,
  isSdcConfigurePayload,
  resolveQuestionnaire,
  resolveQuestionnaireResponse,
} from "./guards";
export { SmartMessagingPhase } from "./phase";
export type {
  CreateSmartMessagingClientOptions,
  SmartMessagingClient,
  SmartMessagingError,
  SmartMessagingOptions,
  SmartMessagingState,
  UseSmartMessagingOptions,
  UseSmartMessagingResult,
} from "./types";
