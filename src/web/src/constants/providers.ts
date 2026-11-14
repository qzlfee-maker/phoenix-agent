import { ProviderOption } from '../types.js';

export const PROVIDERS: ProviderOption[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Официальный API OpenAI',
    defaultUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    hint: 'Официальный API OpenAI',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    tagline: 'Модели семейства Claude',
    defaultUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-api03-...',
    hint: 'Claude через совместимый API-прокси или OpenRouter',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Все LLM по единому ключу',
    defaultUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    hint: 'Доступ к сотням моделей с единым балансом',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Модели семейства Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyPlaceholder: 'AIzaSy...',
    hint: 'OpenAI-совместимый эндпоинт Google AI Studio',
  },
  {
    id: 'custom',
    name: 'Custom / Local',
    tagline: 'Ollama, LM Studio, vLLM',
    defaultUrl: 'http://localhost:11434/v1',
    keyPlaceholder: 'Ключ (если требуется)...',
    hint: 'Любой собственный URL или локальный LLM сервер',
  },
];

export function getProviderById(id?: string): ProviderOption {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}
