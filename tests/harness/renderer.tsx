import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import {
  SmartMessagingPhase,
  type SdcConfigureRequest,
  type SdcRequestExtractRequest,
  type SdcUiChangedFocusPayload,
  type SmartMessagingError,
  useSmartMessaging,
} from "sdc-smart-web-messaging-client/react";
import type {QuestionnaireContext} from "sdc-smart-web-messaging-client";

const rootElement = document.querySelector<HTMLDivElement>("#root");
if (!rootElement) {
  throw new Error("Renderer root not found.");
}

type RendererState = {
  questionnaire: fhir4.Questionnaire | null;
  questionnaireResponse: fhir4.QuestionnaireResponse | null;
  context: QuestionnaireContext | null;
  config: SdcConfigureRequest["payload"] | null;
  phase: SmartMessagingPhase;
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

function App() {
  const eventsRef = useRef<RendererEvents>({ errors: [], extractRequests: [] });
  const {
    questionnaire,
    questionnaireResponse,
    context,
    config,
    phase,
    onQuestionnaireResponseChange,
    onFocusChange,
  } = useSmartMessaging({
    application: { name: "Renderer Test" },
    capabilities: { extraction: true, focusChangeNotifications: true },
    onRequestExtract: async (payload: SdcRequestExtractRequest["payload"]) => {
      eventsRef.current.extractRequests.push(payload);
      return {
        outcome: {
          resourceType: "OperationOutcome",
          issue: [{ severity: "information", code: "informational" }],
        },
        extractedResources: [],
      };
    },
    onError: (error: SmartMessagingError) => {
      eventsRef.current.errors.push(error);
    },
  });

  useEffect(() => {
    (window as typeof window & { __rendererEvents?: RendererEvents }).__rendererEvents =
      eventsRef.current;
  }, []);

  useEffect(() => {
    const state: RendererState = {
      questionnaire,
      questionnaireResponse,
      context,
      config,
      phase,
      phaseName: (typeof phase === "number" && phase in (SmartMessagingPhase as any)
        ? (SmartMessagingPhase as any)[phase]
        : undefined) as string | undefined,
    };

    (window as typeof window & { __rendererState?: RendererState }).__rendererState = state;
  }, [questionnaire, questionnaireResponse, context, config, phase]);

  useEffect(() => {
    const actions: RendererActions = {
      onQuestionnaireResponseChange,
      onFocusChange,
    };

    (window as typeof window & { __rendererActions?: RendererActions }).__rendererActions =
      actions;
  }, [onFocusChange, onQuestionnaireResponseChange]);

  return <div data-phase={phase}>Renderer test harness</div>;
}

createRoot(rootElement).render(<App />);
