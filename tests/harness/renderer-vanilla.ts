import {
  createSmartMessagingClient,
  SmartMessagingPhase,
  type SdcRequestExtractRequest,
  type SdcUiChangedFocusPayload,
  type SmartMessagingError,
  type SmartMessagingState,
} from "sdc-smart-web-messaging-client";

const rootElement = document.querySelector<HTMLDivElement>("#root");
if (!rootElement) {
  throw new Error("Renderer root not found.");
}
const root = rootElement;

type RendererState = SmartMessagingState & {
  phaseName: string | undefined;
};

type RendererActions = {
  onQuestionnaireResponseChange: (response: fhir4.QuestionnaireResponse) => void;
  onFocusChange: (payload: SdcUiChangedFocusPayload) => void;
};

type RendererEvents = {
  errors: SmartMessagingError[];
  extractRequests: unknown[];
};

const events: RendererEvents = {
  errors: [],
  extractRequests: [],
};

const testWindow = window as typeof window & {
  __rendererActions?: RendererActions;
  __rendererEvents?: RendererEvents;
  __rendererState?: RendererState;
};

const client = createSmartMessagingClient({
  application: {name: "Renderer Test"},
  capabilities: {extraction: true, focusChangeNotifications: true},
  onRequestExtract: async (payload: SdcRequestExtractRequest["payload"]) => {
    events.extractRequests.push(payload);
    return {
      outcome: {
        resourceType: "OperationOutcome",
        issue: [{severity: "information", code: "informational"}],
      },
      extractedResources: [],
    };
  },
  onError: (error: SmartMessagingError) => {
    events.errors.push(error);
  },
});

function publishState(state: SmartMessagingState) {
  testWindow.__rendererState = {
    ...state,
    phaseName:
      typeof state.phase === "number" && state.phase in (SmartMessagingPhase as Record<number, string>)
        ? (SmartMessagingPhase as Record<number, string>)[state.phase]
        : undefined,
  };
  root.dataset.phase = String(state.phase);
}

testWindow.__rendererEvents = events;
testWindow.__rendererActions = {
  onQuestionnaireResponseChange: client.onQuestionnaireResponseChange,
  onFocusChange: client.onFocusChange,
};

publishState(client.getState());
client.subscribe((state) => {
  publishState(state);
});

root.textContent = "Renderer test harness";
