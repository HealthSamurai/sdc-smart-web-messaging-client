import {
  isRequest,
  isResponse,
  type SdcMessageType,
  type SdcRequestCurrentQuestionnaireResponseResponse,
  type SdcRequestExtractRequest,
  type SdcResponsePayload,
  type SdcUiChangedQuestionnaireResponsePayload,
} from "sdc-smart-web-messaging";
import {mergeContext} from "./context";
import {
  getContextFromPayload,
  isDisplayQuestionnairePayload,
  isDisplayQuestionnaireResponsePayload,
  isRecord,
  isSdcConfigureContextPayload,
  isSdcConfigurePayload,
  resolveQuestionnaire,
  resolveQuestionnaireResponse,
} from "./guards";
import {buildOutcome} from "./outcome";
import {INITIAL_PHASE, REQUIRED_PHASE_BY_MESSAGE, SmartMessagingPhase, isAtLeastPhase} from "./phase";
import {createMessenger} from "./transport";
import type {
  CreateSmartMessagingClientOptions,
  IncomingMessage,
  SmartMessagingClient,
  SmartMessagingError,
  SmartMessagingOptions,
  SmartMessagingState,
  SmartMessagingStateListener,
} from "./types";

type Messenger = ReturnType<typeof createMessenger>;

type ResolvedEnvironment = {
  currentWindow: Window | null;
  hostWindow: Window | null;
  messagingHandle: string | null;
  messagingOrigin: string | null;
};

function getCurrentWindow(explicitWindow?: Window | null) {
  if (explicitWindow !== undefined) {
    return explicitWindow;
  }
  return typeof window === "undefined" ? null : window;
}

function resolveEnvironment(options: CreateSmartMessagingClientOptions): ResolvedEnvironment {
  const currentWindow = getCurrentWindow(options.window);
  const params =
    currentWindow && (options.messagingHandle == null || options.messagingOrigin == null)
      ? new URLSearchParams(currentWindow.location.search)
      : null;

  return {
    currentWindow,
    hostWindow:
      options.hostWindow !== undefined
        ? options.hostWindow
        : currentWindow?.opener || currentWindow?.parent,
    messagingHandle: options.messagingHandle ?? params?.get("messaging_handle") ?? null,
    messagingOrigin: options.messagingOrigin ?? params?.get("messaging_origin") ?? null,
  };
}

function createInitialState(): SmartMessagingState {
  return {
    questionnaire: null,
    questionnaireResponse: null,
    context: null,
    config: null,
    fhirVersion: null,
    phase: INITIAL_PHASE,
  };
}

export function createSmartMessagingClient(
  initialOptions: CreateSmartMessagingClientOptions,
): SmartMessagingClient {
  const listeners = new Set<SmartMessagingStateListener>();
  const environment = resolveEnvironment(initialOptions);
  const messenger: Messenger | null =
    environment.currentWindow &&
    environment.hostWindow &&
    environment.messagingHandle &&
    environment.messagingOrigin
      ? createMessenger({
          hostWindow: environment.hostWindow,
          messagingHandle: environment.messagingHandle,
          messagingOrigin: environment.messagingOrigin,
        })
      : null;

  let destroyed = false;
  let options: SmartMessagingOptions = initialOptions;
  let state = createInitialState();

  const getState = () => ({...state});

  const emit = () => {
    const snapshot = getState();
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const updateState = (patch: Partial<SmartMessagingState>) => {
    let changed = false;

    for (const key of Object.keys(patch) as Array<keyof SmartMessagingState>) {
      const nextValue = patch[key];
      if (nextValue === undefined || Object.is(state[key], nextValue)) continue;
      changed = true;
    }

    if (!changed) return;
    state = {
      ...state,
      ...patch,
    };
    emit();
  };

  const setPhase = (phase: SmartMessagingPhase) => {
    if (state.phase === phase) return;
    state = {...state, phase};
    emit();
  };

  const advancePhase = (next: SmartMessagingPhase) => {
    if (next === SmartMessagingPhase.Disabled) {
      setPhase(SmartMessagingPhase.Disabled);
      return;
    }
    if (isAtLeastPhase(state.phase, next)) return;
    setPhase(next);
  };

  const reportError = (error: SmartMessagingError) => {
    options.onError?.(error);
  };

  const sendResponse = <TPayload extends SdcResponsePayload>(
    messageType: SdcMessageType,
    responseToMessageId: string,
    payload: TPayload,
  ) => {
    if (destroyed || !messenger) return;
    messenger.sendResponse(messageType, responseToMessageId, payload);
  };

  const handleOutOfOrderMessage = (message: IncomingMessage, messageType: SdcMessageType) => {
    const requiredPhase = REQUIRED_PHASE_BY_MESSAGE[messageType];
    if (!requiredPhase || isAtLeastPhase(state.phase, requiredPhase)) {
      return false;
    }

    const diagnostics = `Unexpected ${messageType} while ${SmartMessagingPhase[state.phase]}. Expected ${SmartMessagingPhase[requiredPhase]} or later.`;
    reportError({
      phase: state.phase,
      messageType,
      message: diagnostics,
    });

    switch (messageType) {
      case "sdc.configure":
      case "sdc.configureContext":
      case "sdc.displayQuestionnaire":
      case "sdc.displayQuestionnaireResponse":
        sendResponse(messageType, message.messageId, {
          status: "error",
          outcome: buildOutcome("error", "invalid", diagnostics),
        });
        return true;
      case "sdc.requestCurrentQuestionnaireResponse":
      case "sdc.requestExtract":
        sendResponse(messageType, message.messageId, {
          outcome: buildOutcome("error", "invalid", diagnostics),
        });
        return true;
      default:
        return true;
    }
  };

  const handleMessage = (message: IncomingMessage) => {
    if (destroyed || typeof message.messageType !== "string") return;
    const messageType = message.messageType as SdcMessageType;

    if (handleOutOfOrderMessage(message, messageType)) {
      return;
    }

    switch (messageType) {
      case "status.handshake": {
        const payload = isRecord(message.payload) ? message.payload : {};
        const fhirVersion = typeof payload.fhirVersion === "string" ? payload.fhirVersion : null;
        updateState({fhirVersion});
        sendResponse("status.handshake", message.messageId, {
          application: options.application,
          capabilities: options.capabilities,
        });
        advancePhase(SmartMessagingPhase.AwaitingConfig);
        return;
      }
      case "sdc.configure": {
        if (!isSdcConfigurePayload(message.payload)) {
          sendResponse("sdc.configure", message.messageId, {
            status: "error",
            outcome: buildOutcome("error", "invalid", "Invalid sdc.configure payload."),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.configure",
            message: "Invalid sdc.configure payload.",
          });
          return;
        }

        updateState({config: message.payload});
        advancePhase(SmartMessagingPhase.AwaitingContext);
        sendResponse("sdc.configure", message.messageId, {status: "success"});
        return;
      }
      case "sdc.configureContext": {
        if (!isSdcConfigureContextPayload(message.payload)) {
          sendResponse("sdc.configureContext", message.messageId, {
            status: "error",
            outcome: buildOutcome("error", "invalid", "Invalid sdc.configureContext payload."),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.configureContext",
            message: "Invalid sdc.configureContext payload.",
          });
          return;
        }

        updateState({context: message.payload.context ?? null});
        advancePhase(SmartMessagingPhase.AwaitingQuestionnaire);
        sendResponse("sdc.configureContext", message.messageId, {status: "success"});
        return;
      }
      case "sdc.displayQuestionnaire": {
        if (!isDisplayQuestionnairePayload(message.payload)) {
          sendResponse("sdc.displayQuestionnaire", message.messageId, {
            status: "error",
            outcome: buildOutcome("error", "invalid", "Invalid sdc.displayQuestionnaire payload."),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.displayQuestionnaire",
            message: "Invalid sdc.displayQuestionnaire payload.",
          });
          return;
        }

        const questionnaire = resolveQuestionnaire(message.payload);
        if (!questionnaire) {
          sendResponse("sdc.displayQuestionnaire", message.messageId, {
            status: "error",
            outcome: buildOutcome(
              "error",
              "invalid",
              "Missing questionnaire in sdc.displayQuestionnaire.",
            ),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.displayQuestionnaire",
            message: "Missing questionnaire in sdc.displayQuestionnaire.",
          });
          return;
        }

        updateState({
          context: mergeContext(state.context, getContextFromPayload(message.payload)),
          questionnaire,
          questionnaireResponse: resolveQuestionnaireResponse(message.payload),
        });
        advancePhase(SmartMessagingPhase.Ready);
        sendResponse("sdc.displayQuestionnaire", message.messageId, {status: "success"});
        return;
      }
      case "sdc.displayQuestionnaireResponse": {
        if (!isDisplayQuestionnaireResponsePayload(message.payload)) {
          sendResponse("sdc.displayQuestionnaireResponse", message.messageId, {
            status: "error",
            outcome: buildOutcome(
              "error",
              "invalid",
              "Invalid sdc.displayQuestionnaireResponse payload.",
            ),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.displayQuestionnaireResponse",
            message: "Invalid sdc.displayQuestionnaireResponse payload.",
          });
          return;
        }

        const questionnaireResponse = resolveQuestionnaireResponse(message.payload);
        if (!questionnaireResponse) {
          sendResponse("sdc.displayQuestionnaireResponse", message.messageId, {
            status: "error",
            outcome: buildOutcome(
              "error",
              "invalid",
              "Missing questionnaireResponse in sdc.displayQuestionnaireResponse.",
            ),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.displayQuestionnaireResponse",
            message: "Missing questionnaireResponse in sdc.displayQuestionnaireResponse.",
          });
          return;
        }

        const questionnaire = resolveQuestionnaire(message.payload);
        if (!state.questionnaire && !questionnaire) {
          sendResponse("sdc.displayQuestionnaireResponse", message.messageId, {
            status: "error",
            outcome: buildOutcome(
              "error",
              "invalid",
              "Questionnaire is required to render QuestionnaireResponse.",
            ),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.displayQuestionnaireResponse",
            message: "Questionnaire is required to render QuestionnaireResponse.",
          });
          return;
        }

        updateState({
          questionnaire: questionnaire ?? state.questionnaire,
          questionnaireResponse,
        });
        advancePhase(SmartMessagingPhase.Ready);
        sendResponse("sdc.displayQuestionnaireResponse", message.messageId, {status: "success"});
        return;
      }
      case "sdc.requestCurrentQuestionnaireResponse": {
        if (!isRecord(message.payload)) {
          sendResponse("sdc.requestCurrentQuestionnaireResponse", message.messageId, {
            outcome: buildOutcome(
              "error",
              "invalid",
              "Invalid sdc.requestCurrentQuestionnaireResponse payload.",
            ),
          } satisfies SdcRequestCurrentQuestionnaireResponseResponse["payload"]);
          reportError({
            phase: state.phase,
            messageType: "sdc.requestCurrentQuestionnaireResponse",
            message: "Invalid sdc.requestCurrentQuestionnaireResponse payload.",
          });
          return;
        }

        if (state.questionnaireResponse) {
          sendResponse("sdc.requestCurrentQuestionnaireResponse", message.messageId, {
            questionnaireResponse: state.questionnaireResponse,
          });
          return;
        }

        sendResponse("sdc.requestCurrentQuestionnaireResponse", message.messageId, {
          outcome: buildOutcome(
            "error",
            "not-found",
            "No QuestionnaireResponse is currently loaded.",
          ),
        });
        reportError({
          phase: state.phase,
          messageType: "sdc.requestCurrentQuestionnaireResponse",
          message: "No QuestionnaireResponse is currently loaded.",
        });
        return;
      }
      case "sdc.requestExtract": {
        if (!isRecord(message.payload)) {
          sendResponse("sdc.requestExtract", message.messageId, {
            outcome: buildOutcome("error", "invalid", "Invalid sdc.requestExtract payload."),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.requestExtract",
            message: "Invalid sdc.requestExtract payload.",
          });
          return;
        }

        if (!options.onRequestExtract) {
          sendResponse("sdc.requestExtract", message.messageId, {
            outcome: buildOutcome(
              "error",
              "not-supported",
              "Extract is not implemented in this renderer.",
            ),
          });
          reportError({
            phase: state.phase,
            messageType: "sdc.requestExtract",
            message: "Extract is not implemented in this renderer.",
          });
          return;
        }

        const extractPayload = message.payload as SdcRequestExtractRequest["payload"];
        void Promise.resolve()
          .then(() => options.onRequestExtract?.(extractPayload))
          .then((payload) => {
            if (destroyed || !payload) return;
            sendResponse("sdc.requestExtract", message.messageId, payload);
          })
          .catch((error) => {
            const diagnostics =
              error instanceof Error
                ? `Extract handler failed: ${error.message}`
                : "Extract handler failed.";
            sendResponse("sdc.requestExtract", message.messageId, {
              outcome: buildOutcome("error", "exception", diagnostics),
            });
            reportError({
              phase: state.phase,
              messageType: "sdc.requestExtract",
              message: diagnostics,
            });
          });
        return;
      }
      default:
        return;
    }
  };

  const onQuestionnaireResponseChange: SmartMessagingClient["onQuestionnaireResponseChange"] = (
    response,
  ) => {
    if (destroyed) return;
    updateState({questionnaireResponse: response});
    if (!messenger) return;
    messenger.sendEvent("sdc.ui.changedQuestionnaireResponse", {
      questionnaireResponse: response,
    } satisfies SdcUiChangedQuestionnaireResponsePayload);
  };

  const onFocusChange: SmartMessagingClient["onFocusChange"] = (payload) => {
    if (destroyed || !messenger) return;
    messenger.sendEvent("sdc.ui.changedFocus", payload);
  };

  const subscribe = (listener: SmartMessagingStateListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const handleWindowMessage = (event: MessageEvent) => {
    if (destroyed || !messenger) return;
    if (event.source !== environment.hostWindow) return;
    if (event.origin !== environment.messagingOrigin) return;

    const message = event.data ?? {};
    if (isResponse(message) || !isRequest(message)) return;
    if (message.messagingHandle !== environment.messagingHandle) return;
    handleMessage(message);
  };

  if (environment.currentWindow && messenger) {
    environment.currentWindow.addEventListener("message", handleWindowMessage);
  } else {
    advancePhase(SmartMessagingPhase.Disabled);
    reportError({
      phase: state.phase,
      message: "Missing SDC SWM parameters.",
    });
  }

  return {
    getState,
    subscribe,
    updateOptions: (nextOptions) => {
      options = nextOptions;
    },
    handleMessage,
    onQuestionnaireResponseChange,
    onFocusChange,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      environment.currentWindow?.removeEventListener("message", handleWindowMessage);
    },
  };
}
