import { useCallback, useEffect, useMemo, useState } from 'react';
import { importTrie, Trie } from 'cspell-trie-lib';
import ptBrTrieGzUrl from '@/node_modules/@cspell/dict-pt-br/pt_BR.trie.gz?url';
import {
  LinguisticFieldRef,
  LinguisticFinding,
} from '../types/norma';
import {
  analyzeTextFieldLinguistics,
  PortugueseSpellChecker,
} from '../utils/revisorLinguistico';

export type DictionaryLoadStatus = 'loading' | 'ready' | 'fallback';

const CUSTOM_DICT_STORAGE_KEY = 'norma_custom_spellcheck_words';

interface ProofreaderGlobal {
  availability?: (options?: {
    expectedInputLanguages?: string[];
  }) => Promise<string>;
}

let cachedTrie: Trie | null = null;
let loadPromise: Promise<Trie | null> | null = null;

function readCustomDictionary(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_DICT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      .map((w) => w.trim().toLowerCase());
  } catch {
    return [];
  }
}

function writeCustomDictionary(words: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_DICT_STORAGE_KEY, JSON.stringify(words));
  } catch {
    // Ignora falha de armazenamento em modo privado/restrito
  }
}

function createTrieSpellChecker(
  trie: Trie,
  customWordSet: Set<string>
): PortugueseSpellChecker {
  const suggestCache = new Map<string, string[]>();

  return {
    hasWord(word: string): boolean {
      if (!word) return true;
      const lower = word.toLowerCase();
      if (customWordSet.has(lower)) return true;
      return trie.has(word) || trie.has(lower);
    },
    suggestWords(word: string, max = 5): string[] {
      const key = `${word.toLowerCase()}:${max}`;
      const cached = suggestCache.get(key);
      if (cached) return cached;

      const results = trie.suggest(word.toLowerCase(), {
        numSuggestions: max,
        ignoreCase: true,
      });
      suggestCache.set(key, results);
      return results;
    },
  };
}

function createCustomOnlySpellChecker(
  customWordSet: Set<string>
): PortugueseSpellChecker {
  return {
    hasWord(word: string): boolean {
      if (!word) return true;
      return customWordSet.has(word.toLowerCase());
    },
    suggestWords(): string[] {
      return [];
    },
  };
}

async function decompressGzipResponseToText(
  response: Response
): Promise<string> {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (isGzip && typeof DecompressionStream === 'function') {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function loadBrowserPtBrTrie(): Promise<Trie | null> {
  if (cachedTrie) {
    return cachedTrie;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const res = await fetch(ptBrTrieGzUrl);
      if (!res.ok) {
        return null;
      }
      const rawTrieText = await decompressGzipResponseToText(res);
      const lines = rawTrieText.split(/\r?\n/);
      const root = importTrie(lines);
      cachedTrie = new Trie(root);
      return cachedTrie;
    } catch {
      return null;
    }
  })();

  return loadPromise;
}

export async function loadBrowserPtBrSpellChecker(): Promise<PortugueseSpellChecker | null> {
  const trie = await loadBrowserPtBrTrie();
  if (!trie) return null;
  return createTrieSpellChecker(trie, new Set(readCustomDictionary()));
}

export interface SpellcheckHookResult {
  spellChecker: PortugueseSpellChecker | null;
  dictionaryStatus: DictionaryLoadStatus;
  segmenterSupported: boolean;
  proofreaderSupported: boolean;
  customWords: string[];
  addToDictionary: (word: string) => void;
  removeFromDictionary: (word: string) => void;
  checkText: (params: {
    text: string;
    fieldKey: string;
    fieldRef: LinguisticFieldRef;
    fieldLabel: string;
    isNormativeDevice?: boolean;
    isSubItemLowercaseStart?: boolean;
    isUpperHeading?: boolean;
    skipProperNounCaps?: boolean;
    ignoredSignatures?: Set<string>;
  }) => LinguisticFinding[];
  nativeFieldProps: {
    spellCheck: true;
    lang: string;
    autoCorrect: string;
  };
}

/**
 * Hook `useSpellcheck` — integra APIs de verificação ortográfica do navegador
 * (atributo nativo `spellCheck`/`lang="pt-BR"`, `Intl.Segmenter`,
 * `fetch` + `DecompressionStream`, detecção progressiva da `Proofreader` API
 * e dicionário personalizado em `localStorage`) ao revisor ortográfico,
 * gramatical e jurídico em tempo real.
 */
export function useSpellcheck(): SpellcheckHookResult {
  const [trie, setTrie] = useState<Trie | null>(() => cachedTrie);
  const [dictionaryStatus, setDictionaryStatus] =
    useState<DictionaryLoadStatus>(() => (cachedTrie ? 'ready' : 'loading'));
  const [proofreaderSupported, setProofreaderSupported] = useState(false);
  const [customWords, setCustomWords] = useState<string[]>(() =>
    readCustomDictionary()
  );

  const segmenterSupported = useMemo(
    () => typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function',
    []
  );

  useEffect(() => {
    let active = true;

    if (!cachedTrie) {
      loadBrowserPtBrTrie().then((loadedTrie) => {
        if (!active) return;
        if (loadedTrie) {
          setTrie(loadedTrie);
          setDictionaryStatus('ready');
        } else {
          setDictionaryStatus('fallback');
        }
      });
    }

    const maybeProofreader = (
      globalThis as unknown as { Proofreader?: ProofreaderGlobal }
    ).Proofreader;
    if (maybeProofreader && typeof maybeProofreader.availability === 'function') {
      maybeProofreader
        .availability({ expectedInputLanguages: ['pt'] })
        .then((status) => {
          if (active && (status === 'available' || status === 'readily')) {
            setProofreaderSupported(true);
          }
        })
        .catch(() => {
          // Ignora silenciosamente caso a API experimental não esteja ativa
        });
    }

    return () => {
      active = false;
    };
  }, []);

  const customWordSet = useMemo(
    () => new Set(customWords.map((w) => w.toLowerCase())),
    [customWords]
  );

  const spellChecker = useMemo<PortugueseSpellChecker | null>(() => {
    if (trie) {
      return createTrieSpellChecker(trie, customWordSet);
    }
    if (customWordSet.size > 0) {
      return createCustomOnlySpellChecker(customWordSet);
    }
    return null;
  }, [trie, customWordSet]);

  const addToDictionary = useCallback((word: string) => {
    const clean = word.trim().toLowerCase();
    if (!clean) return;
    setCustomWords((prev) => {
      if (prev.includes(clean)) return prev;
      const next = [...prev, clean];
      writeCustomDictionary(next);
      return next;
    });
  }, []);

  const removeFromDictionary = useCallback((word: string) => {
    const clean = word.trim().toLowerCase();
    setCustomWords((prev) => {
      const next = prev.filter((w) => w !== clean);
      writeCustomDictionary(next);
      return next;
    });
  }, []);

  const checkText = useCallback(
    (params: {
      text: string;
      fieldKey: string;
      fieldRef: LinguisticFieldRef;
      fieldLabel: string;
      isNormativeDevice?: boolean;
      isSubItemLowercaseStart?: boolean;
      isUpperHeading?: boolean;
      skipProperNounCaps?: boolean;
      ignoredSignatures?: Set<string>;
    }): LinguisticFinding[] =>
      analyzeTextFieldLinguistics(
        {
          fieldKey: params.fieldKey,
          fieldRef: params.fieldRef,
          fieldLabel: params.fieldLabel,
          text: params.text,
          isNormativeDevice: params.isNormativeDevice ?? false,
          isSubItemLowercaseStart: params.isSubItemLowercaseStart,
          isUpperHeading: params.isUpperHeading,
          skipProperNounCaps: params.skipProperNounCaps,
        },
        params.ignoredSignatures,
        spellChecker
      ),
    [spellChecker]
  );

  const nativeFieldProps = useMemo(
    () => ({
      spellCheck: true as const,
      lang: 'pt-BR',
      autoCorrect: 'on',
    }),
    []
  );

  return {
    spellChecker,
    dictionaryStatus,
    segmenterSupported,
    proofreaderSupported,
    customWords,
    addToDictionary,
    removeFromDictionary,
    checkText,
    nativeFieldProps,
  };
}

export function useFieldLinguisticReview(params: {
  text: string;
  fieldKey: string;
  fieldRef: LinguisticFieldRef;
  fieldLabel: string;
  isNormativeDevice?: boolean;
  isSubItemLowercaseStart?: boolean;
  isUpperHeading?: boolean;
  skipProperNounCaps?: boolean;
  spellChecker?: PortugueseSpellChecker | null;
  ignoredSignatures?: Set<string>;
  debounceMs?: number;
}): LinguisticFinding[] {
  const {
    text,
    fieldKey,
    fieldRef,
    fieldLabel,
    isNormativeDevice = false,
    isSubItemLowercaseStart = false,
    isUpperHeading = false,
    skipProperNounCaps = false,
    spellChecker = null,
    ignoredSignatures,
    debounceMs = 90,
  } = params;

  const [debouncedText, setDebouncedText] = useState(text);

  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedText(text);
      return;
    }
    const timer = window.setTimeout(() => setDebouncedText(text), debounceMs);
    return () => window.clearTimeout(timer);
  }, [text, debounceMs]);

  return useMemo(
    () =>
      analyzeTextFieldLinguistics(
        {
          fieldKey,
          fieldRef,
          fieldLabel,
          text: debouncedText,
          isNormativeDevice,
          isSubItemLowercaseStart,
          isUpperHeading,
          skipProperNounCaps,
        },
        ignoredSignatures,
        spellChecker
      ),
    [
      fieldKey,
      fieldRef,
      fieldLabel,
      debouncedText,
      isNormativeDevice,
      isSubItemLowercaseStart,
      isUpperHeading,
      skipProperNounCaps,
      ignoredSignatures,
      spellChecker,
    ]
  );
}
