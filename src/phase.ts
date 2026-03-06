import type { SdcMessageType } from "sdc-smart-web-messaging";

export enum SmartMessagingPhase {
  Disabled = -1,
  AwaitingHandshake = 0,
  AwaitingConfig = 1,
  AwaitingContext = 2,
  AwaitingQuestionnaire = 3,
  Ready = 4,
}

export const INITIAL_PHASE: SmartMessagingPhase = SmartMessagingPhase.AwaitingHandshake;

export const REQUIRED_PHASE_BY_MESSAGE: Partial<Record<SdcMessageType, SmartMessagingPhase>> = {
  "sdc.configure": SmartMessagingPhase.AwaitingConfig,
  "sdc.configureContext": SmartMessagingPhase.AwaitingContext,
  "sdc.displayQuestionnaire": SmartMessagingPhase.AwaitingQuestionnaire,
  "sdc.displayQuestionnaireResponse": SmartMessagingPhase.AwaitingQuestionnaire,
  "sdc.requestCurrentQuestionnaireResponse": SmartMessagingPhase.Ready,
  "sdc.requestExtract": SmartMessagingPhase.Ready,
};

export function isAtLeastPhase(current: SmartMessagingPhase, required: SmartMessagingPhase) {
  return current >= required;
}
