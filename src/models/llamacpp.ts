import { OpenAIProvider } from './openai';

/**
 * llama.cpp via its OpenAI-compatible `server` endpoint. Same wire protocol,
 * just a different default base URL and no API key required.
 */
export class LlamaCppProvider extends OpenAIProvider {
  constructor(endpoint: string = process.env.LLAMACPP_ENDPOINT ?? 'http://127.0.0.1:8080/v1') {
    super(process.env.LLAMACPP_API_KEY, endpoint, 'llamacpp');
  }
}
