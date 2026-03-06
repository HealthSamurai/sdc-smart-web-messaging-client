import type {
  LaunchContextItem,
  QuestionnaireContext,
  SdcConfigureContextRequest,
  SdcConfigureRequest,
  SdcDisplayQuestionnaireRequest,
  SdcDisplayQuestionnaireResponseRequest,
} from "sdc-smart-web-messaging";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isQuestionnaire(value: unknown): value is fhir4.Questionnaire {
  return isRecord(value) && value.resourceType === "Questionnaire";
}

export function isQuestionnaireResponse(value: unknown): value is fhir4.QuestionnaireResponse {
  return isRecord(value) && value.resourceType === "QuestionnaireResponse";
}

export function resolveQuestionnaire(payload: unknown): fhir4.Questionnaire | null {
  if (!isRecord(payload)) return null;
  if (isQuestionnaire(payload)) return payload;
  const candidate = payload.questionnaire;
  if (isQuestionnaire(candidate)) return candidate;
  return null;
}

export function resolveQuestionnaireResponse(payload: unknown): fhir4.QuestionnaireResponse | null {
  if (!isRecord(payload)) return null;
  if (isQuestionnaireResponse(payload)) return payload;
  const candidate = payload.questionnaireResponse;
  if (isQuestionnaireResponse(candidate)) return candidate;
  return null;
}

export function isLaunchContextItem(value: unknown): value is LaunchContextItem {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  if (value.contentReference != null && !isRecord(value.contentReference)) {
    return false;
  }
  if (value.contentResource != null && !isRecord(value.contentResource)) {
    return false;
  }
  return true;
}

export function isQuestionnaireContext(value: unknown): value is QuestionnaireContext {
  if (!isRecord(value)) return false;
  if (value.subject != null && !isRecord(value.subject)) return false;
  if (value.author != null && !isRecord(value.author)) return false;
  if (value.encounter != null && !isRecord(value.encounter)) return false;
  if (value.launchContext != null) {
    if (!Array.isArray(value.launchContext)) return false;
    if (!value.launchContext.every(isLaunchContextItem)) return false;
  }
  return true;
}

export function isSdcConfigurePayload(value: unknown): value is SdcConfigureRequest["payload"] {
  if (!isRecord(value)) return false;
  if (value.terminologyServer != null && typeof value.terminologyServer !== "string") {
    return false;
  }
  if (value.dataServer != null && typeof value.dataServer !== "string") {
    return false;
  }
  if (value.configuration != null && !isRecord(value.configuration)) {
    return false;
  }
  return true;
}

export function isSdcConfigureContextPayload(
  value: unknown,
): value is SdcConfigureContextRequest["payload"] {
  if (!isRecord(value)) return false;
  if (value.context != null && !isQuestionnaireContext(value.context)) {
    return false;
  }
  return true;
}

type DisplayQuestionnairePayload = SdcDisplayQuestionnaireRequest["payload"] | fhir4.Questionnaire;

export function isDisplayQuestionnairePayload(
  value: unknown,
): value is DisplayQuestionnairePayload {
  if (isQuestionnaire(value)) return true;
  if (!isRecord(value)) return false;
  if (value.questionnaire != null && !isQuestionnaire(value.questionnaire)) {
    return false;
  }
  if (
    value.questionnaireResponse != null &&
    !isQuestionnaireResponse(value.questionnaireResponse)
  ) {
    return false;
  }
  if (value.context != null && !isQuestionnaireContext(value.context)) {
    return false;
  }
  return true;
}

type DisplayQuestionnaireResponsePayload =
  | SdcDisplayQuestionnaireResponseRequest["payload"]
  | fhir4.QuestionnaireResponse;

export function isDisplayQuestionnaireResponsePayload(
  value: unknown,
): value is DisplayQuestionnaireResponsePayload {
  if (isQuestionnaireResponse(value)) return true;
  if (!isRecord(value)) return false;
  if (
    value.questionnaireResponse != null &&
    !isQuestionnaireResponse(value.questionnaireResponse)
  ) {
    return false;
  }
  if (value.questionnaire != null && !isQuestionnaire(value.questionnaire)) {
    return false;
  }
  return true;
}

export function getContextFromPayload(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  const context = payload.context;
  return isQuestionnaireContext(context) ? context : undefined;
}
