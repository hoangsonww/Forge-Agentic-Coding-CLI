import { OpenAIProvider } from './openai';

/**
 * vLLM via its OpenAI-compatible server. Default port is 8000.
 *
 * Start one with:
 *   vllm serve <model> --port 8000
 *
 * Point Forge elsewhere with `VLLM_ENDPOINT=http://host:port/v1`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
export class VllmProvider extends OpenAIProvider {
  constructor(endpoint: string = process.env.VLLM_ENDPOINT ?? 'http://127.0.0.1:8000/v1') {
    super(process.env.VLLM_API_KEY, endpoint, 'vllm');
  }
}
