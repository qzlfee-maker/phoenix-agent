import { useState, useEffect, useCallback } from 'react';
import { fetchProviderModels } from '../api.js';
import { ProviderId } from '../types.js';

interface UseModelFetcherOptions {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  hasSavedKey?: boolean;
  enabled?: boolean;
}

export function useModelFetcher({
  provider,
  baseUrl,
  apiKey,
  hasSavedKey = false,
  enabled = true,
}: UseModelFetcherOptions) {
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const canFetch =
    enabled &&
    baseUrl.trim().length > 0 &&
    (apiKey.trim().length > 0 || hasSavedKey || provider === 'custom');

  const loadModels = useCallback(async () => {
    if (!canFetch) return;

    setIsLoadingModels(true);
    setModelsError(null);

    try {
      const res = await fetchProviderModels({
        provider,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      });

      if (res.success && Array.isArray(res.models)) {
        setModels(res.models);
        setModelsError(null);
      } else {
        setModels([]);
        setModelsError(res.error || 'Не удалось загрузить модели. Проверьте ключ');
      }
    } catch {
      setModels([]);
      setModelsError('Не удалось загрузить модели. Проверьте ключ');
    } finally {
      setIsLoadingModels(false);
    }
  }, [provider, baseUrl, apiKey, canFetch]);

  // Debounce 800ms on input changes
  useEffect(() => {
    if (!canFetch) {
      setModels([]);
      setModelsError(null);
      return;
    }

    const timer = setTimeout(() => {
      loadModels();
    }, 800);

    return () => clearTimeout(timer);
  }, [loadModels, canFetch]);

  return {
    models,
    isLoadingModels,
    modelsError,
    refetchModels: loadModels,
    canRefresh: canFetch,
  };
}
