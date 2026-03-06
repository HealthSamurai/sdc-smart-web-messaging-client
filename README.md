# sdc-smart-web-messaging-client

[![bundle size](https://img.shields.io/bundlephobia/minzip/sdc-smart-web-messaging-client)](https://bundlephobia.com/package/sdc-smart-web-messaging-client)

Framework-agnostic client and React hook for building SDC Questionnaire renderers that speak the SMART Web Messaging protocol.

This library wraps the SDC SMART Web Messaging message flow in a framework-agnostic browser client. It handles the handshake, listens for host requests, validates payloads, and exposes the current questionnaire, response, context, and configuration to your renderer. The React hook is a thin wrapper over that core client.

## Install

```bash
pnpm add sdc-smart-web-messaging-client
```

## Usage

### Framework-agnostic client

```ts
import { createSmartMessagingClient } from "sdc-smart-web-messaging-client";

const client = createSmartMessagingClient({
  application: { name: "My Renderer", version: "1.0.0" },
});

client.subscribe((state) => {
  console.log("phase", state.phase);
  console.log("questionnaire", state.questionnaire);
});

client.onQuestionnaireResponseChange({
  resourceType: "QuestionnaireResponse",
  status: "in-progress",
});
```

Use this in vanilla JS, Angular, or any other framework. By default the client reads `messaging_handle` and `messaging_origin` from `window.location.search` and uses `window.opener || window.parent` as the host window. You can also pass `messagingHandle`, `messagingOrigin`, `hostWindow`, and `window` explicitly.

### React hook

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

export function RendererApp() {
  const { questionnaire, questionnaireResponse, onQuestionnaireResponseChange } =
    useSmartMessaging({
      application: { name: "My Renderer", version: "1.0.0" },
    });

  if (!questionnaire) {
    return <div>Waiting for questionnaire.</div>;
  }

  return (
    <FormRenderer
      questionnaire={questionnaire}
      questionnaireResponse={questionnaireResponse}
      onChange={onQuestionnaireResponseChange}
    />
  );
}
```

Notes for integration:
The host launches the renderer with `messaging_handle` and `messaging_origin` query params. The hook reads these from `window.location.search` and will not communicate without them.
The hook does not initiate a `status.handshake`. It responds to host-initiated handshakes and never regresses phase.

## Examples

### Identify your renderer

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

useSmartMessaging({
  application: { name: "My Renderer", version: "1.0.0" },
});
```

### Advertise what the renderer supports

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

useSmartMessaging({
  application: { name: "My Renderer" },
  capabilities: { extraction: true, focusChangeNotifications: true },
});
```

Set `focusChangeNotifications` to true if you plan to call `onFocusChange`.
Set `extraction` to true if you provide `onRequestExtract`.

### Handle `$extract` requests from the host

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

useSmartMessaging({
  application: { name: "My Renderer" },
  onRequestExtract: async ({ questionnaireResponse }) => {
    // return an OperationOutcome and/or extracted resources here.
  },
});
```

### Log invalid messages

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

useSmartMessaging({
  application: { name: "My Renderer" },
  onError: ({ message, messageType, phase }) => {
    console.warn("Smart messaging error", { message, messageType, phase });
  },
});
```

### Pull patient context when you need it

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

const { context } = useSmartMessaging({ application: { name: "My Renderer" } });

const subjectRef = context?.subject?.reference;
```

### Read host-provided configuration

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

const { config } = useSmartMessaging({ application: { name: "My Renderer" } });

const terminologyServer = config?.terminologyServer;
```

### Render UI based on the current phase

```tsx
import { SmartMessagingPhase, useSmartMessaging } from "sdc-smart-web-messaging-client/react";

const { phase } = useSmartMessaging({ application: { name: "My Renderer" } });

switch (phase) {
  case SmartMessagingPhase.AwaitingHandshake:
    return <div>Waiting for handshake.</div>;
  case SmartMessagingPhase.AwaitingConfig:
    return <div>Waiting for configuration.</div>;
  case SmartMessagingPhase.AwaitingContext:
    return <div>Waiting for context.</div>;
  case SmartMessagingPhase.AwaitingQuestionnaire:
    return <div>Waiting for questionnaire.</div>;
  case SmartMessagingPhase.Ready:
    return <div>Ready.</div>;
  case SmartMessagingPhase.Disabled:
    return <div>Missing messaging parameters.</div>;
  default:
    return null;
}
```

### Notify the host when the response changes

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

const { questionnaire, onQuestionnaireResponseChange } = useSmartMessaging({
  application: { name: "My Renderer" },
});

if (!questionnaire) return null;

return (
  <FormRenderer
    questionnaire={questionnaire}
    onChange={onQuestionnaireResponseChange}
  />
);
```

### Notify the host when focus changes

```tsx
import { useSmartMessaging } from "sdc-smart-web-messaging-client/react";

const { onFocusChange } = useSmartMessaging({ application: { name: "My Renderer" } });

onFocusChange({ linkId: "patient-name", focus_field: "item[0].answer[0].value" });
```

## API

### createSmartMessagingClient(options)

Returns a framework-agnostic client with:

| Field                           | Type                                        | Description                                                                 |
|---------------------------------|---------------------------------------------|-----------------------------------------------------------------------------|
| `getState`                      | `() => SmartMessagingState`                 | Returns the current messaging state snapshot.                               |
| `subscribe`                     | `(listener) => () => void`                  | Subscribes to state changes and returns an unsubscribe function.            |
| `updateOptions`                 | `(options) => void`                         | Replaces the current options/callbacks used for future messages.            |
| `handleMessage`                 | `(message) => void`                         | Feeds a request message into the state machine manually.                    |
| `onQuestionnaireResponseChange` | `(response: QuestionnaireResponse) => void` | Sends `sdc.ui.changedQuestionnaireResponse` and updates local state.        |
| `onFocusChange`                 | `(payload: SdcUiChangedFocusPayload) => void` | Sends `sdc.ui.changedFocus` to the host.                                    |
| `destroy`                       | `() => void`                                | Removes the window listener and stops the client.                           |

### useSmartMessaging(options)

`options`:

| Option             | Type                                                                                                                                      | Required | Description                                                                          |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------|
| `application`      | `{ name: string; publisher?: string; version?: string }`                                                                                  | Yes      | Application identity included in the handshake response.                             |
| `capabilities`     | `{ extraction?: boolean; focusChangeNotifications?: boolean }`                                                                            | No       | Advertised capabilities for the host.                                                |
| `onRequestExtract` | `(payload: SdcRequestExtractRequest["payload"]) => Promise<SdcRequestExtractResponse["payload"]> \| SdcRequestExtractResponse["payload"]` | No       | Handler for `sdc.requestExtract`. If omitted, the hook replies with `not-supported`. |
| `onError`          | `(error: SmartMessagingError) => void`                                                                                                    | No       | Called when the hook receives an invalid payload or cannot progress.                 |

`returns`:

| Field                           | Type                                        | Description                                                                      |
|---------------------------------|---------------------------------------------|----------------------------------------------------------------------------------|
| `questionnaire`                 | `Questionnaire \| null`                     | The current questionnaire.                                                       |
| `questionnaireResponse`         | `QuestionnaireResponse \| null`             | The current questionnaire response.                                              |
| `context`                       | `QuestionnaireContext \| null`              | Context from `sdc.configureContext` plus any merged context in display messages. |
| `config`                        | `SdcConfigureRequest["payload"] \| null`    | The last `sdc.configure` payload.                                                |
| `fhirVersion`                   | `string \| null`                            | FHIR version received from the host `status.handshake` payload, if provided.     |
| `phase`                         | `SmartMessagingPhase`                       | Current lifecycle phase (handshake → config → context → questionnaire → ready). |
| `onQuestionnaireResponseChange` | `(response: QuestionnaireResponse) => void` | Sends `sdc.ui.changedQuestionnaireResponse` to the host and updates local phase. |
| `onFocusChange`                 | `(payload: SdcUiChangedFocusPayload) => void` | Sends `sdc.ui.changedFocus` to the host.                                         |

## Phase

Phase starts at `SmartMessagingPhase.AwaitingHandshake` and advances as valid messages arrive. The hook enforces ordering; out-of-order requests are rejected with an error response and forwarded to `onError`. Use `SmartMessagingPhase.Disabled` to detect missing query params.

Phase transitions:

| Phase                                     | Advances when                                                             |
|-------------------------------------------|---------------------------------------------------------------------------|
| `SmartMessagingPhase.AwaitingHandshake`   | Host sends `status.handshake`                                             |
| `SmartMessagingPhase.AwaitingConfig`      | `sdc.configure` accepted                                                  |
| `SmartMessagingPhase.AwaitingContext`     | `sdc.configureContext` accepted                                           |
| `SmartMessagingPhase.AwaitingQuestionnaire` | `sdc.displayQuestionnaire` or `sdc.displayQuestionnaireResponse` accepted |
| `SmartMessagingPhase.Ready`               | Terminal for the normal flow                                              |
| `SmartMessagingPhase.Disabled`            | Missing `messaging_handle` or `messaging_origin`                          |

Ordering rules:
`sdc.configure` requires `SmartMessagingPhase.AwaitingConfig` or later.
`sdc.configureContext` requires `SmartMessagingPhase.AwaitingContext` or later.
`sdc.displayQuestionnaire` and `sdc.displayQuestionnaireResponse` require `SmartMessagingPhase.AwaitingQuestionnaire` or later.
`sdc.requestCurrentQuestionnaireResponse` and `sdc.requestExtract` require `SmartMessagingPhase.Ready`.
`status.handshake` is always accepted and never regresses phase.

## Development

```bash
pnpm install
pnpm run build
pnpm run typecheck
```

## License

MIT

## Third-Party Licenses

This package embeds the SDC SMART Web Messaging protocol definitions from the
`sdc-smart-web-messaging` project (BSD 3-Clause). See `dist/LICENSES/bsd-3-clause.txt`.
