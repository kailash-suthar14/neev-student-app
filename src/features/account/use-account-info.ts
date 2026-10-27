import { useCallback, useEffect, useState } from 'react';

import { useAppServices } from '@/config/app-services';
import { getUserMessage, toAppError } from '@/core/errors';

import type { AccountInfo } from './models';

export type AccountInfoState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; account: AccountInfo };

/** Loads the signed-in user's backend account details. */
export function useAccountInfo(onUnauthorized?: () => void) {
  const { account } = useAppServices();
  const [state, setState] = useState<AccountInfoState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await account.getAccountInfo();
        if (active) setState({ status: 'ready', account: info });
      } catch (raw) {
        if (!active) return;
        const error = toAppError(raw);
        if (error.code === 'unauthorized') onUnauthorized?.();
        setState({ status: 'error', message: getUserMessage(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [account, reloadKey, onUnauthorized]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);
  return { state, reload };
}
