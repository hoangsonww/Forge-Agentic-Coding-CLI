/**
 * LM Studio's built-in server (Local Server → "Start Server"). Defaults to
 * http://127.0.0.1:1234/v1 and speaks the OpenAI chat-completions API.
 *
 * Override with `LMSTUDIO_ENDPOINT`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { OpenAIProvider } from './openai';

export class LmStudioProvider extends OpenAIProvider {
  constructor(endpoint: string = process.env.LMSTUDIO_ENDPOINT ?? 'http://127.0.0.1:1234/v1') {
    // LM Studio does not require an API key but will ignore one if sent.
    super(process.env.LMSTUDIO_API_KEY ?? 'lm-studio', endpoint, 'lmstudio');
  }
}
