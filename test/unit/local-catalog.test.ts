/**
 * Local catalog tests cover the logic for parsing model ids to extract family and size information, classifying models into "micro", "mid", "heavy", or "specialized" classes, and picking the best model for a given role from a list of installed models. The tests use a variety of realistic model id formats to ensure robust parsing and classification.
 *
 * The family detection tests verify that the correct family is identified for a range of model id formats, including those from Ollama and hosted providers. The size extraction tests check that parameter counts are correctly parsed, including for MoE models. The classification tests ensure that models are assigned to the correct class based on size and specialization, and that even unknown models receive a reasonable meta. Finally, the role picker tests confirm that the best model is chosen for "executor", "fast", and "architect" roles according to the expected preferences.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from 'vitest';
import {
  classifyModel,
  pickModelForRole,
  _sizeBForTest as sizeB,
  _detectFamilyForTest as detect,
} from '../../src/models/local-catalog';

describe('local-catalog — family detection', () => {
  it('identifies current-gen Llama variants', () => {
    expect(detect('llama3:8b')).toBe('llama3');
    expect(detect('llama3.1:70b')).toBe('llama3');
    expect(detect('meta-llama/Llama-3.2-3B-Instruct')).toBe('llama3');
    expect(detect('llama4:16x17b')).toBe('llama4');
  });

  it('identifies DeepSeek variants', () => {
    expect(detect('deepseek-r1:32b')).toBe('deepseek-r1');
    expect(detect('deepseek-v3')).toBe('deepseek-v3');
    expect(detect('deepseek-coder:6.7b')).toBe('deepseek-coder');
  });

  it('identifies Qwen variants', () => {
    expect(detect('qwen2.5:14b')).toBe('qwen25');
    expect(detect('qwen2.5-coder:7b')).toBe('qwen25-coder');
    expect(detect('qwen3:8b')).toBe('qwen3');
  });

  it('identifies Gemma/Phi/Mistral', () => {
    expect(detect('gemma2:9b')).toBe('gemma2');
    expect(detect('gemma3:27b')).toBe('gemma3');
    expect(detect('phi3:mini')).toBe('phi3');
    expect(detect('phi4')).toBe('phi4');
    expect(detect('mixtral:8x7b')).toBe('mixtral');
    expect(detect('mistral-nemo:12b')).toBe('mistral-nemo');
  });

  it('identifies code specialists', () => {
    expect(detect('codellama:7b')).toBe('codellama');
    expect(detect('codestral:22b')).toBe('codestral');
    expect(detect('starcoder2:7b')).toBe('starcoder');
  });

  it('identifies hosted model names too', () => {
    expect(detect('claude-opus-4-7')).toBe('claude-opus');
    expect(detect('gpt-4o')).toBe('gpt4');
    expect(detect('o3-mini')).toBe('o-series');
  });

  it('returns "unknown" for totally unrecognised ids', () => {
    expect(detect('exotic-custom-model-v2')).toBe('unknown');
  });
});

describe('local-catalog — size extraction', () => {
  it('parses parameter counts from Ollama-style ids', () => {
    expect(sizeB('llama3:8b')).toBe(8);
    expect(sizeB('llama3.1:70b')).toBe(70);
    expect(sizeB('phi3:mini')).toBeNull();
  });

  it('parses MoE totals (NxKb)', () => {
    expect(sizeB('mixtral:8x7b')).toBe(56);
    expect(sizeB('mixtral:8x22b')).toBe(176);
  });
});

describe('local-catalog — classification', () => {
  it('70B is heavy regardless of family baseline', () => {
    expect(classifyModel('llama3.1:70b').class).toBe('heavy');
  });

  it('coder variants keep the "specialized" tag', () => {
    expect(classifyModel('qwen2.5-coder:32b').class).toBe('specialized');
    expect(classifyModel('deepseek-coder:6.7b').class).toBe('specialized');
  });

  it('small models classify as micro', () => {
    expect(classifyModel('gemma:2b').class).toBe('micro');
    expect(classifyModel('tinyllama:1.1b').class).toBe('micro');
  });

  it('assigns reasonable context windows', () => {
    expect(classifyModel('llama3.1:8b').contextTokens).toBeGreaterThanOrEqual(32_000);
    expect(classifyModel('qwen2.5:14b').contextTokens).toBeGreaterThanOrEqual(32_000);
    expect(classifyModel('phi3:mini').contextTokens).toBeGreaterThanOrEqual(16_000);
  });

  it('unknown models still get a routable meta so we do not refuse to serve', () => {
    const meta = classifyModel('some-custom-fork:13b');
    expect(meta.roles.length).toBeGreaterThan(0);
    expect(meta.contextTokens).toBeGreaterThan(0);
  });
});

describe('local-catalog — role picker', () => {
  it('prefers a code-specialist for executor role', () => {
    const picked = pickModelForRole(
      [{ id: 'llama3:8b' }, { id: 'deepseek-coder:6.7b' }, { id: 'phi3:mini' }],
      'executor',
    );
    expect(picked).toBe('deepseek-coder:6.7b');
  });

  it('prefers a small model for fast role', () => {
    const picked = pickModelForRole(
      [{ id: 'llama3:70b' }, { id: 'phi3:mini' }, { id: 'gemma2:9b' }],
      'fast',
    );
    expect(picked).toBe('phi3:mini');
  });

  it('prefers a heavy model for architect role', () => {
    const picked = pickModelForRole(
      [{ id: 'llama3:8b' }, { id: 'deepseek-r1:70b' }, { id: 'qwen2.5:7b' }],
      'architect',
    );
    expect(picked).toBe('deepseek-r1:70b');
  });

  it('returns null for an empty installed list', () => {
    expect(pickModelForRole([], 'planner')).toBeNull();
  });

  it('never refuses to pick — even unknown models are candidates', () => {
    const picked = pickModelForRole([{ id: 'mystery-model:42b' }], 'executor');
    expect(picked).toBe('mystery-model:42b');
  });
});
