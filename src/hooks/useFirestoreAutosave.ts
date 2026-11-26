import { useCallback, useEffect, useRef } from 'react';
import {
  isFirestoreQuotaError,
  isFirestoreTransientError,
} from '../utils/cloudStorage';

export interface UseFirestoreAutosaveOptions {
  /** Ativa o autosave apenas quando autenticado, aprovado e dados iniciais da nuvem carregados */
  enabled: boolean;
  /** Identificador do documento ativo (ex.: activeCloudNormaId) */
  entityKey: string;
  /** Assinatura determinística do estado atual em edição */
  signature: string;
  /** Assinatura inicial já confirmada no Firestore (para evitar gravação redundante ao abrir) */
  initialCloudSignature?: string | null;
  /** Debounce após a última digitação (ex.: 900ms texto, 1800ms com imagens) */
  trailingMs: number;
  /** Teto máximo de espera durante digitação contínua ininterrupta (ex.: 3500ms) */
  maxWaitMs: number;
  /** Chave no localStorage que registra pendência de sincronização caso a aba feche offline */
  pendingStorageKey: string;
  /** Pausa por cota excedida */
  quotaPaused: boolean;
  /** Callback de gravação no Firestore (deve ler sempre o estado mais recente) */
  onSave: () => Promise<void>;
  /** Callbacks de estado de sincronização */
  onSaving: () => void;
  onSynced: () => void;
  onOffline: () => void;
  onQuotaExceeded: (error: unknown) => void;
  onError: (error: unknown, isTransientRetryScheduled: boolean) => void;
}

export interface FirestoreAutosaveController {
  /** Força gravação imediata (se houver alterações pendentes ou se force=true) */
  flushNow: (force?: boolean) => Promise<void>;
  /** Informa ao controlador que uma assinatura específica já foi confirmada no Firestore */
  markSynced: (entityKey: string, signature: string) => void;
  /** Limpa estado pendente e timers (ex.: ao trocar/excluir rascunho) */
  resetTracking: (nextSyncedSignature?: string | null) => void;
}

const MAX_AUTO_RETRIES = 6;
const WRITE_TIMEOUT_MS = 20000;

function readPendingDirtyFlag(
  storageKey: string,
  entityKey: string
): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      entityKey?: string;
      signature?: string;
    };
    if (
      parsed &&
      parsed.entityKey === entityKey &&
      typeof parsed.signature === 'string'
    ) {
      return parsed.signature;
    }
  } catch {
    // Ignorar falha de leitura
  }
  return null;
}

function writePendingDirtyFlag(
  storageKey: string,
  entityKey: string,
  signature: string
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        entityKey,
        signature,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // Ignora cota do localStorage
  }
}

function clearPendingDirtyFlag(storageKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignora erro
  }
}

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function withWriteTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new Error(
          'Tempo limite excedido ao aguardar resposta do servidor (network timeout).'
        )
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Controlador agressivo e resiliente de auto-save no Firestore:
 * - Debounce curto (trailingMs) + garantia de maxWaitMs (evita starvation em digitação contínua)
 * - Execução serializada (sem corrida entre gravações lentas)
 * - Fila suja persistida em localStorage para sobreviver a quedas offline/reload
 * - Retry automático com backoff exponencial em falhas transitórias e flush imediato no evento 'online'
 * - Flush imediato ao ocultar aba (visibilitychange) ou fechar página (pagehide)
 */
export function useFirestoreAutosave({
  enabled,
  entityKey,
  signature,
  initialCloudSignature,
  trailingMs,
  maxWaitMs,
  pendingStorageKey,
  quotaPaused,
  onSave,
  onSaving,
  onSynced,
  onOffline,
  onQuotaExceeded,
  onError,
}: UseFirestoreAutosaveOptions): FirestoreAutosaveController {
  const latestRef = useRef({
    enabled,
    entityKey,
    signature,
    trailingMs,
    maxWaitMs,
    pendingStorageKey,
    quotaPaused,
    onSave,
    onSaving,
    onSynced,
    onOffline,
    onQuotaExceeded,
    onError,
  });

  latestRef.current = {
    enabled,
    entityKey,
    signature,
    trailingMs,
    maxWaitMs,
    pendingStorageKey,
    quotaPaused,
    onSave,
    onSaving,
    onSynced,
    onOffline,
    onQuotaExceeded,
    onError,
  };

  const lastSyncedSigRef = useRef<string | null>(null);
  const lastEntityKeyRef = useRef<string>(entityKey);
  const manualSyncedOverrideRef = useRef<{
    entityKey: string;
    signature: string;
  } | null>(null);
  const dirtySinceRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const queuedDuringFlightRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const executeFlush = useCallback(
    async (force = false): Promise<void> => {
      const ctx = latestRef.current;
      if (!ctx.enabled || ctx.quotaPaused) return;

      if (!force && lastSyncedSigRef.current === ctx.signature) {
        dirtySinceRef.current = null;
        clearPendingDirtyFlag(ctx.pendingStorageKey);
        return;
      }

      if (!isBrowserOnline()) {
        writePendingDirtyFlag(
          ctx.pendingStorageKey,
          ctx.entityKey,
          ctx.signature
        );
        ctx.onOffline();
        return;
      }

      if (inFlightRef.current) {
        queuedDuringFlightRef.current = true;
        return;
      }

      clearTimers();
      inFlightRef.current = true;
      queuedDuringFlightRef.current = false;

      const attemptEntityKey = ctx.entityKey;
      const attemptSig = ctx.signature;
      ctx.onSaving();

      let succeeded = false;
      try {
        await withWriteTimeout(ctx.onSave(), WRITE_TIMEOUT_MS);
        succeeded = true;
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          dirtySinceRef.current = null;
          retryCountRef.current = 0;
          lastSyncedSigRef.current = attemptSig;
          clearPendingDirtyFlag(ctx.pendingStorageKey);
          ctx.onQuotaExceeded(err);
        } else if (!isBrowserOnline()) {
          writePendingDirtyFlag(
            ctx.pendingStorageKey,
            attemptEntityKey,
            attemptSig
          );
          ctx.onOffline();
        } else if (isFirestoreTransientError(err)) {
          writePendingDirtyFlag(
            ctx.pendingStorageKey,
            attemptEntityKey,
            attemptSig
          );
          const nextAttempt = retryCountRef.current + 1;
          retryCountRef.current = nextAttempt;

          if (nextAttempt <= MAX_AUTO_RETRIES) {
            const baseDelay = Math.min(
              20000,
              1200 * Math.pow(2, nextAttempt - 1)
            );
            const jitter = Math.floor(Math.random() * 400);
            const retryDelay = baseDelay + jitter;
            ctx.onError(err, true);
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              void executeFlush(false);
            }, retryDelay);
          } else {
            ctx.onError(err, false);
          }
        } else {
          ctx.onError(err, false);
        }
      } finally {
        inFlightRef.current = false;
      }

      if (succeeded) {
        const afterCtx = latestRef.current;
        retryCountRef.current = 0;

        // Só atualiza assinatura se continuarmos no mesmo documento
        if (afterCtx.entityKey === attemptEntityKey) {
          lastSyncedSigRef.current = attemptSig;

          if (
            afterCtx.signature !== attemptSig ||
            queuedDuringFlightRef.current
          ) {
            // Usuário continuou digitando durante o envio lento: agenda novo flush rápido
            queuedDuringFlightRef.current = false;
            dirtySinceRef.current = Date.now();
            writePendingDirtyFlag(
              afterCtx.pendingStorageKey,
              afterCtx.entityKey,
              afterCtx.signature
            );
            debounceTimerRef.current = window.setTimeout(() => {
              debounceTimerRef.current = null;
              void executeFlush(false);
            }, 300);
          } else {
            dirtySinceRef.current = null;
            clearPendingDirtyFlag(afterCtx.pendingStorageKey);
            afterCtx.onSynced();
          }
        }
      }
    },
    [clearTimers]
  );

  const scheduleAggressiveFlush = useCallback(() => {
    const ctx = latestRef.current;
    if (!ctx.enabled || ctx.quotaPaused) return;
    if (lastSyncedSigRef.current === ctx.signature) return;

    if (dirtySinceRef.current === null) {
      dirtySinceRef.current = Date.now();
    }

    writePendingDirtyFlag(ctx.pendingStorageKey, ctx.entityKey, ctx.signature);

    if (!isBrowserOnline()) {
      ctx.onOffline();
      return;
    }

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const elapsed = Date.now() - dirtySinceRef.current;
    const remainingMaxWait = Math.max(0, ctx.maxWaitMs - elapsed);
    const delay = Math.min(ctx.trailingMs, remainingMaxWait);

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void executeFlush(false);
    }, delay);
  }, [executeFlush]);

  // Reinicia rastreamento ao trocar de documento
  useEffect(() => {
    if (lastEntityKeyRef.current !== entityKey) {
      lastEntityKeyRef.current = entityKey;
      clearTimers();
      dirtySinceRef.current = null;
      retryCountRef.current = 0;
      queuedDuringFlightRef.current = false;

      if (
        manualSyncedOverrideRef.current &&
        manualSyncedOverrideRef.current.entityKey === entityKey
      ) {
        lastSyncedSigRef.current = manualSyncedOverrideRef.current.signature;
        manualSyncedOverrideRef.current = null;
      } else {
        lastSyncedSigRef.current = null;
      }
    }
  }, [entityKey, clearTimers]);

  // Inicializa assinatura sincronizada a partir da nuvem somente se não houver edição local pendente
  useEffect(() => {
    if (!enabled) return;

    if (
      manualSyncedOverrideRef.current &&
      manualSyncedOverrideRef.current.entityKey === entityKey
    ) {
      lastSyncedSigRef.current = manualSyncedOverrideRef.current.signature;
      manualSyncedOverrideRef.current = null;
      dirtySinceRef.current = null;
      clearPendingDirtyFlag(pendingStorageKey);
    }

    if (lastSyncedSigRef.current === null) {
      const pendingLocalSig = readPendingDirtyFlag(pendingStorageKey, entityKey);
      if (
        initialCloudSignature &&
        initialCloudSignature === signature &&
        (!pendingLocalSig || pendingLocalSig === initialCloudSignature)
      ) {
        lastSyncedSigRef.current = initialCloudSignature;
        dirtySinceRef.current = null;
        clearPendingDirtyFlag(pendingStorageKey);
        return;
      }
    }

    if (lastSyncedSigRef.current !== signature) {
      scheduleAggressiveFlush();
    }
  }, [
    enabled,
    entityKey,
    signature,
    initialCloudSignature,
    pendingStorageKey,
    quotaPaused,
    scheduleAggressiveFlush,
  ]);

  // Recuperação imediata ao voltar a conexão, retomar foco ou fechar/ocultar aba
  useEffect(() => {
    const handleOnline = () => {
      const ctx = latestRef.current;
      if (!ctx.enabled || ctx.quotaPaused) return;
      retryCountRef.current = 0;
      if (lastSyncedSigRef.current !== ctx.signature) {
        clearTimers();
        debounceTimerRef.current = window.setTimeout(() => {
          debounceTimerRef.current = null;
          void executeFlush(false);
        }, 250);
      }
    };

    const handleOffline = () => {
      const ctx = latestRef.current;
      if (!ctx.enabled) return;
      clearTimers();
      if (lastSyncedSigRef.current !== ctx.signature) {
        writePendingDirtyFlag(
          ctx.pendingStorageKey,
          ctx.entityKey,
          ctx.signature
        );
        ctx.onOffline();
      }
    };

    const handleVisibilityChange = () => {
      const ctx = latestRef.current;
      if (!ctx.enabled || ctx.quotaPaused) return;
      if (lastSyncedSigRef.current === ctx.signature) return;

      if (document.visibilityState === 'hidden') {
        if (isBrowserOnline()) {
          void executeFlush(false);
        } else {
          writePendingDirtyFlag(
            ctx.pendingStorageKey,
            ctx.entityKey,
            ctx.signature
          );
        }
      } else if (document.visibilityState === 'visible' && isBrowserOnline()) {
        if (!inFlightRef.current && retryTimerRef.current === null) {
          clearTimers();
          debounceTimerRef.current = window.setTimeout(() => {
            debounceTimerRef.current = null;
            void executeFlush(false);
          }, 250);
        }
      }
    };

    const handlePageHide = () => {
      const ctx = latestRef.current;
      if (!ctx.enabled || ctx.quotaPaused) return;
      if (lastSyncedSigRef.current !== ctx.signature && isBrowserOnline()) {
        void executeFlush(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [clearTimers, executeFlush]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const flushNow = useCallback(
    async (force = false) => {
      clearTimers();
      await executeFlush(force);
    },
    [clearTimers, executeFlush]
  );

  const markSynced = useCallback(
    (syncedEntityKey: string, syncedSignature: string) => {
      manualSyncedOverrideRef.current = {
        entityKey: syncedEntityKey,
        signature: syncedSignature,
      };
      if (latestRef.current.entityKey === syncedEntityKey) {
        clearTimers();
        lastSyncedSigRef.current = syncedSignature;
        manualSyncedOverrideRef.current = null;
        dirtySinceRef.current = null;
        retryCountRef.current = 0;
        queuedDuringFlightRef.current = false;
        clearPendingDirtyFlag(latestRef.current.pendingStorageKey);
      }
    },
    [clearTimers]
  );

  const resetTracking = useCallback(
    (nextSyncedSignature: string | null = null) => {
      clearTimers();
      manualSyncedOverrideRef.current = null;
      lastSyncedSigRef.current = nextSyncedSignature;
      dirtySinceRef.current = null;
      retryCountRef.current = 0;
      queuedDuringFlightRef.current = false;
      clearPendingDirtyFlag(latestRef.current.pendingStorageKey);
    },
    [clearTimers]
  );

  return {
    flushNow,
    markSynced,
    resetTracking,
  };
}
