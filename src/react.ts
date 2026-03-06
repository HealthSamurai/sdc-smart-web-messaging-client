import {useEffect, useState} from "react";
import {createSmartMessagingClient} from "./client";
import type {UseSmartMessagingOptions, UseSmartMessagingResult} from "./types";

export * from "./index";
export type {UseSmartMessagingOptions, UseSmartMessagingResult} from "./types";

export function useSmartMessaging(options: UseSmartMessagingOptions): UseSmartMessagingResult {
  const [client] = useState(() => createSmartMessagingClient(options));
  const [state, setState] = useState(() => client.getState());

  useEffect(() => client.subscribe(setState), [client]);

  useEffect(() => {
    client.updateOptions(options);
  }, [client, options]);

  useEffect(
    () => () => {
      client.destroy();
    },
    [client],
  );

  return {
    ...state,
    onQuestionnaireResponseChange: client.onQuestionnaireResponseChange,
    onFocusChange: client.onFocusChange,
  };
}
