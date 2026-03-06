import { test, expect } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { SmartMessagingPhase } from "../src/phase";

type HostMessage = {
  messageType?: string;
  messageId?: string;
  responseToMessageId?: string;
  payload?: Record<string, any>;
};

type RendererEvents = {
  errors: Array<{ messageType?: string; message?: string }>;
  extractRequests: unknown[];
};

async function waitForHost(page: Page) {
  await page.waitForFunction(() => Boolean(window.__host));
}

async function getRendererFrame(page: Page) {
  await page.waitForFunction(() => {
    const iframe = document.querySelector<HTMLIFrameElement>("#renderer");
    return Boolean(iframe?.contentWindow);
  });
  const frame = page
    .frames()
    .find(
      (candidate) =>
        candidate !== page.mainFrame() &&
        /\/renderer(?:-vanilla)?\.html(?:\?|$)/.test(candidate.url()),
    );
  if (!frame) throw new Error("Renderer frame not found.");
  return frame;
}

async function waitForMessage(
  page: Page,
  messageType: string,
  responseToMessageId?: string,
) {
  await page.waitForFunction(
    ({ messageType, responseToMessageId }) =>
      window.__messages?.some(
        (message) =>
          message.messageType === messageType &&
          (!responseToMessageId || message.responseToMessageId === responseToMessageId),
      ),
    { messageType, responseToMessageId },
  );

  return page.evaluate(
    ({ messageType, responseToMessageId }) =>
      window.__messages?.find(
        (message) =>
          message.messageType === messageType &&
          (!responseToMessageId || message.responseToMessageId === responseToMessageId),
      ) as HostMessage | undefined,
    { messageType, responseToMessageId },
  );
}

async function sendRequest(
  page: Page,
  messageType: string,
  payload: unknown,
) {
  return page.evaluate(
    ({ messageType, payload }) => window.__host?.sendRequest(messageType, payload),
    { messageType, payload },
  );
}

async function ensureHandshake(page: Page) {
  const handshakeId = await sendRequest(page, "status.handshake", {});
  await waitForMessage(page, "status.handshake", handshakeId);
}

async function clearMessages(page: Page) {
  await page.evaluate(() => window.__host?.clearMessages());
}

async function waitForRendererPhase(frame: Frame, phase: SmartMessagingPhase) {
  await frame.waitForFunction(
    (targetPhase) => window.__rendererState?.phase === targetPhase,
    phase,
  );
}

async function getRendererEvents(frame: Frame) {
  return frame.evaluate(() => window.__rendererEvents as RendererEvents | undefined);
}

test("exchanges messages through a real iframe", async ({ page }) => {
  await page.goto("/");
  await waitForHost(page);
  const frame = await getRendererFrame(page);

  await ensureHandshake(page);
  await clearMessages(page);

  const questionnaire = {
    resourceType: "Questionnaire",
    id: "test-questionnaire",
    status: "active",
    item: [{ linkId: "q1", text: "Name", type: "string" }],
  };

  const questionnaireResponse = {
    resourceType: "QuestionnaireResponse",
    status: "in-progress",
    questionnaire: "Questionnaire/test-questionnaire",
    item: [{ linkId: "q1", answer: [{ valueString: "Jane" }] }],
  };

  const context = {
    subject: { reference: "Patient/1" },
  };

  await sendRequest(page, "sdc.configure", {
    terminologyServer: "https://example.org/fhir",
  });
  await sendRequest(page, "sdc.configureContext", { context });
  await sendRequest(page, "sdc.displayQuestionnaire", {
    questionnaire,
    questionnaireResponse,
  });

  await waitForRendererPhase(frame, SmartMessagingPhase.Ready);

  const rendererState = await frame.evaluate(() => window.__rendererState);
  expect(rendererState?.questionnaire?.id).toBe("test-questionnaire");
  expect(rendererState?.context?.subject?.reference).toBe("Patient/1");

  await clearMessages(page);

  await frame.evaluate(() => {
    window.__rendererActions?.onQuestionnaireResponseChange({
      resourceType: "QuestionnaireResponse",
      status: "in-progress",
      questionnaire: "Questionnaire/test-questionnaire",
    });
  });

  const changeMessage = await waitForMessage(page, "sdc.ui.changedQuestionnaireResponse");
  expect(changeMessage?.payload?.questionnaireResponse?.status).toBe("in-progress");
  const updatedRendererState = await frame.evaluate(() => window.__rendererState);
  expect(updatedRendererState?.questionnaireResponse?.status).toBe("in-progress");

  await clearMessages(page);

  await frame.evaluate(() => {
    window.__rendererActions?.onFocusChange({ linkId: "q1" });
  });

  await waitForMessage(page, "sdc.ui.changedFocus");

  await clearMessages(page);

  const responseId = await sendRequest(page, "sdc.requestCurrentQuestionnaireResponse", {});
  const responseMessage = await waitForMessage(
    page,
    "sdc.requestCurrentQuestionnaireResponse",
    responseId,
  );

  expect(responseMessage?.payload?.questionnaireResponse?.status).toBe("in-progress");
});

test("rejects out-of-order requests", async ({ page }) => {
  await page.goto("/");
  await waitForHost(page);
  await ensureHandshake(page);
  await clearMessages(page);

  const questionnaire = {
    resourceType: "Questionnaire",
    id: "q-out-of-order",
    status: "active",
  };

  const requestId = await sendRequest(page, "sdc.displayQuestionnaire", { questionnaire });
  const response = await waitForMessage(page, "sdc.displayQuestionnaire", requestId);

  expect(response?.payload?.status).toBe("error");
  expect(response?.payload?.outcome?.issue?.[0]?.diagnostics).toContain(
    "Unexpected sdc.displayQuestionnaire",
  );

  const rendererEvents = await getRendererEvents(await getRendererFrame(page));
  expect(rendererEvents?.errors?.some((error) => error.messageType === "sdc.displayQuestionnaire"))
    .toBe(true);
});

test("returns error when questionnaire is missing", async ({ page }) => {
  await page.goto("/");
  await waitForHost(page);
  await ensureHandshake(page);
  await clearMessages(page);

  const configId = await sendRequest(page, "sdc.configure", {
    terminologyServer: "https://example.org/fhir",
  });
  await waitForMessage(page, "sdc.configure", configId);

  const contextId = await sendRequest(page, "sdc.configureContext", { context: {} });
  await waitForMessage(page, "sdc.configureContext", contextId);

  await clearMessages(page);

  const displayId = await sendRequest(page, "sdc.displayQuestionnaire", {});
  const response = await waitForMessage(page, "sdc.displayQuestionnaire", displayId);

  expect(response?.payload?.status).toBe("error");
  expect(response?.payload?.outcome?.issue?.[0]?.diagnostics).toBe(
    "Missing questionnaire in sdc.displayQuestionnaire.",
  );

  const rendererEvents = await getRendererEvents(await getRendererFrame(page));
  expect(rendererEvents?.errors?.some((error) => error.messageType === "sdc.displayQuestionnaire"))
    .toBe(true);
});

test("responds to host-initiated handshake without regressing phase", async ({ page }) => {
  await page.goto("/");
  await waitForHost(page);
  const frame = await getRendererFrame(page);

  await ensureHandshake(page);
  await clearMessages(page);

  const questionnaire = {
    resourceType: "Questionnaire",
    id: "q-handshake",
    status: "active",
  };

  await sendRequest(page, "sdc.configure", {});
  await sendRequest(page, "sdc.configureContext", { context: {} });
  await sendRequest(page, "sdc.displayQuestionnaire", { questionnaire });
  await waitForRendererPhase(frame, SmartMessagingPhase.Ready);

  await clearMessages(page);

  const handshakeId = await sendRequest(page, "status.handshake", {});
  const response = await waitForMessage(page, "status.handshake", handshakeId);

  expect(response?.payload?.application?.name).toBe("Renderer Test");

  const rendererState = await frame.evaluate(() => window.__rendererState);
  expect(rendererState?.phase).toBe(SmartMessagingPhase.Ready);
});

test("returns extract results from the renderer", async ({ page }) => {
  await page.goto("/");
  await waitForHost(page);
  const frame = await getRendererFrame(page);

  await ensureHandshake(page);
  await clearMessages(page);

  const questionnaire = {
    resourceType: "Questionnaire",
    id: "q-extract",
    status: "active",
  };

  await sendRequest(page, "sdc.configure", {});
  await sendRequest(page, "sdc.configureContext", { context: {} });
  await sendRequest(page, "sdc.displayQuestionnaire", { questionnaire });
  await waitForRendererPhase(frame, SmartMessagingPhase.Ready);

  await clearMessages(page);

  const extractPayload = {
    questionnaireResponse: {
      resourceType: "QuestionnaireResponse",
      status: "in-progress",
      questionnaire: "Questionnaire/q-extract",
    },
  };

  const extractId = await sendRequest(page, "sdc.requestExtract", extractPayload);
  const response = await waitForMessage(page, "sdc.requestExtract", extractId);

  expect(response?.payload?.outcome?.resourceType).toBe("OperationOutcome");
  expect(response?.payload?.extractedResources).toEqual([]);

  const rendererEvents = await getRendererEvents(frame);
  expect(rendererEvents?.extractRequests?.[0]).toEqual(extractPayload);
});

test("disables when messaging params are missing", async ({ page }) => {
  await page.goto("/renderer.html");

  await page.waitForFunction(
    (phase) => window.__rendererState?.phase === phase,
    SmartMessagingPhase.Disabled,
  );

  const rendererState = await page.evaluate(() => window.__rendererState);
  expect(rendererState?.phase).toBe(SmartMessagingPhase.Disabled);
});

test("exchanges messages through the framework-agnostic client", async ({ page }) => {
  await page.goto("/?renderer=/renderer-vanilla.html");
  await waitForHost(page);
  const frame = await getRendererFrame(page);

  await ensureHandshake(page);
  await clearMessages(page);

  const questionnaire = {
    resourceType: "Questionnaire",
    id: "test-questionnaire-vanilla",
    status: "active",
    item: [{ linkId: "q1", text: "Name", type: "string" }],
  };

  const questionnaireResponse = {
    resourceType: "QuestionnaireResponse",
    status: "in-progress",
    questionnaire: "Questionnaire/test-questionnaire-vanilla",
    item: [{ linkId: "q1", answer: [{ valueString: "Jane" }] }],
  };

  const configId = await sendRequest(page, "sdc.configure", {
    terminologyServer: "https://example.org/fhir",
  });
  await waitForMessage(page, "sdc.configure", configId);

  const contextId = await sendRequest(page, "sdc.configureContext", {
    context: { subject: { reference: "Patient/2" } },
  });
  await waitForMessage(page, "sdc.configureContext", contextId);

  const displayId = await sendRequest(page, "sdc.displayQuestionnaire", {
    questionnaire,
    questionnaireResponse,
  });
  await waitForMessage(page, "sdc.displayQuestionnaire", displayId);

  await waitForRendererPhase(frame, SmartMessagingPhase.Ready);

  const rendererState = await frame.evaluate(() => window.__rendererState);
  expect(rendererState?.questionnaire?.id).toBe("test-questionnaire-vanilla");
  expect(rendererState?.context?.subject?.reference).toBe("Patient/2");

  await clearMessages(page);

  await frame.evaluate(() => {
    window.__rendererActions?.onQuestionnaireResponseChange({
      resourceType: "QuestionnaireResponse",
      status: "completed",
      questionnaire: "Questionnaire/test-questionnaire-vanilla",
    });
  });

  const changeMessage = await waitForMessage(page, "sdc.ui.changedQuestionnaireResponse");
  expect(changeMessage?.payload?.questionnaireResponse?.status).toBe("completed");

  await clearMessages(page);

  const extractId = await sendRequest(page, "sdc.requestExtract", {
    questionnaireResponse,
  });
  const extractResponse = await waitForMessage(page, "sdc.requestExtract", extractId);

  expect(extractResponse?.payload?.outcome?.resourceType).toBe("OperationOutcome");
  expect(extractResponse?.payload?.extractedResources).toEqual([]);

  const rendererEvents = await getRendererEvents(frame);
  expect(rendererEvents?.extractRequests).toHaveLength(1);
});
