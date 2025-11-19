# GLM-4.6 Usage Guide

This guide covers how to use GLM-4.6's advanced features in AX CLI, including thinking mode, configurable parameters, and reasoning content visualization.

---

## Table of Contents

1. [Overview](#overview)
2. [Thinking Mode](#thinking-mode)
3. [Model Configuration](#model-configuration)
4. [Temperature Control](#temperature-control)
5. [Context Window](#context-window)
6. [Reasoning Visualization](#reasoning-visualization)
7. [Advanced Usage](#advanced-usage)
8. [API Reference](#api-reference)

---

## Overview

GLM-4.6 is a state-of-the-art language model with enhanced capabilities:

- **200K Context Window**: Process long documents and conversations
- **Thinking Mode**: Advanced reasoning with step-by-step explanations
- **128K Output Tokens**: Generate long-form responses
- **30% More Efficient**: Better token utilization than previous models
- **Temperature Range**: 0.6-1.0 for precise control

---

## Thinking Mode

### What is Thinking Mode?

Thinking mode enables GLM-4.6 to show its reasoning process before providing the final answer. This helps you:

- **Understand** how the AI arrived at its conclusion
- **Trust** the AI's recommendations with transparent logic
- **Debug** incorrect responses by seeing the thought process
- **Learn** problem-solving approaches from the AI

### Enabling Thinking Mode

Thinking mode is controlled via the `ChatOptions` interface:

```typescript
import { GrokClient } from './grok/client.js';
import type { ChatOptions } from './grok/types.js';

const client = new GrokClient(apiKey);

const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },  // Enable thinking mode
  temperature: 0.7,
  maxTokens: 8192,
};

const response = await client.chat(messages, tools, options);
```

### Thinking Mode Output

When thinking mode is enabled, the response includes `reasoning_content`:

```typescript
{
  choices: [{
    message: {
      role: 'assistant',
      reasoning_content: 'Let me break this down step by step...
1. First, I need to understand the user's question
2. Then identify the relevant context
3. Finally, formulate a clear answer',
      content: 'Based on my analysis, here is the answer...'
    }
  }]
}
```

### Visual Display

AX CLI automatically displays reasoning content in a bordered box:

```
┌─ 💭 Thinking...
│  Let me approach this systematically:
│  1. Parse the user's requirements
│  2. Identify the best solution
│  3. Implement with proper error handling
└─

⏺ Based on this analysis, I recommend creating a new function
   that handles the edge cases we discussed...
```

---

## Model Configuration

### Available Models

AX CLI supports multiple GLM models with different capabilities:

```typescript
export const GLM_MODELS = {
  'grok-code-fast-1': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsThinking: false,
    temperatureRange: { min: 0.0, max: 2.0 },
  },
  'glm-4.6': {
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsThinking: true,
    temperatureRange: { min: 0.6, max: 1.0 },
  },
  'glm-4-air': {
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsThinking: false,
    temperatureRange: { min: 0.6, max: 1.0 },
  },
  'glm-4-airx': {
    contextWindow: 8192,
    maxOutputTokens: 8192,
    supportsThinking: false,
    temperatureRange: { min: 0.6, max: 1.0 },
  },
};
```

### Selecting a Model

```typescript
// Via ChatOptions
const options: ChatOptions = {
  model: 'glm-4.6',
  // ... other options
};

// Or via GrokClient constructor
const client = new GrokClient(apiKey, 'glm-4.6');
```

### Model Capabilities

| Model | Context | Output | Thinking | Temperature Range |
|-------|---------|--------|----------|-------------------|
| glm-4.6 | 200K | 128K | ✅ Yes | 0.6 - 1.0 |
| grok-code-fast-1 | 128K | 4096 | ❌ No | 0.0 - 2.0 |
| glm-4-air | 128K | 8192 | ❌ No | 0.6 - 1.0 |
| glm-4-airx | 8K | 8192 | ❌ No | 0.6 - 1.0 |

---

## Temperature Control

### What is Temperature?

Temperature controls the randomness/creativity of responses:

- **Low (0.6-0.7)**: More focused, deterministic, factual
- **Medium (0.7-0.8)**: Balanced creativity and accuracy
- **High (0.9-1.0)**: More creative, varied, exploratory

### Setting Temperature

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  temperature: 0.7,  // Recommended default
};
```

### Temperature Validation

AX CLI validates temperature based on the selected model:

```typescript
// GLM-4.6: Must be between 0.6 and 1.0
validateTemperature(0.7, 'glm-4.6');  // ✅ Valid
validateTemperature(0.5, 'glm-4.6');  // ❌ Throws error

// grok-code-fast-1: Must be between 0.0 and 2.0
validateTemperature(1.5, 'grok-code-fast-1');  // ✅ Valid
```

### Use Cases

**Low Temperature (0.6)**
```typescript
// Code generation, technical documentation
const options: ChatOptions = {
  model: 'glm-4.6',
  temperature: 0.6,
};
```

**Medium Temperature (0.7-0.8)**
```typescript
// General conversation, problem-solving
const options: ChatOptions = {
  model: 'glm-4.6',
  temperature: 0.7,
};
```

**High Temperature (0.9-1.0)**
```typescript
// Creative writing, brainstorming
const options: ChatOptions = {
  model: 'glm-4.6',
  temperature: 0.9,
};
```

---

## Context Window

### Understanding Context Windows

GLM-4.6 supports a **200,000 token context window**, allowing you to:

- Process entire codebases
- Analyze long documents
- Maintain extended conversations
- Include comprehensive context

### Output Tokens

While GLM-4.6 can *read* 200K tokens, it can *generate* up to **128K output tokens**:

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  maxTokens: 128000,  // Maximum for glm-4.6
};
```

### Token Validation

```typescript
// Validate max tokens for a model
validateMaxTokens(100000, 'glm-4.6');  // ✅ Valid (< 128K)
validateMaxTokens(150000, 'glm-4.6');  // ❌ Throws error (> 128K)
```

### Best Practices

1. **Start conservatively**: Use 8192 tokens for most tasks
2. **Scale up as needed**: Increase for long-form generation
3. **Monitor usage**: Track token consumption for cost control
4. **Optimize prompts**: Reduce unnecessary context

### Example: Long Document Processing

```typescript
import { GrokClient } from './grok/client.js';
import fs from 'fs';

const client = new GrokClient(apiKey);

// Read a large document
const longDocument = fs.readFileSync('large-file.txt', 'utf-8');

const messages = [{
  role: 'user',
  content: `Analyze this document and provide a summary:

${longDocument}`
}];

const options: ChatOptions = {
  model: 'glm-4.6',
  maxTokens: 50000,  // Large output for comprehensive summary
  temperature: 0.7,
};

const response = await client.chat(messages, [], options);
```

---

## Reasoning Visualization

### ReasoningDisplay Component

AX CLI includes a built-in component for visualizing reasoning content:

```typescript
import { ReasoningDisplay } from './ui/components/reasoning-display.js';

<ReasoningDisplay
  content={reasoningContent}
  visible={true}
  isStreaming={false}
/>
```

### Streaming Reasoning

During streaming responses, reasoning appears progressively:

```typescript
for await (const chunk of client.chatStream(messages, tools, options)) {
  if (chunk.type === 'reasoning') {
    console.log('Reasoning:', chunk.reasoningContent);
  }
  if (chunk.type === 'content') {
    console.log('Content:', chunk.content);
  }
}
```

### Parsing Reasoning Steps

The `parseReasoningSteps` utility breaks reasoning into structured steps:

```typescript
import { parseReasoningSteps } from './ui/components/reasoning-display.js';

const reasoning = `Step 1: Understand the requirements
Step 2: Design the solution
Step 3: Implement the code`;

const steps = parseReasoningSteps(reasoning);
// Returns: ['Step 1: Understand...', 'Step 2: Design...', 'Step 3: Implement...']
```

### ReasoningSection Component

For multi-step displays:

```typescript
import { ReasoningSection } from './ui/components/reasoning-display.js';

<ReasoningSection
  steps={steps}
  showStepNumbers={true}
  isStreaming={false}
/>
```

Output:
```
┌─ 💭 Thinking Process
│  1. Understand the requirements
│  2. Design the solution
│  3. Implement the code
└─
```

---

## Advanced Usage

### Combining Features

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
  temperature: 0.7,
  maxTokens: 50000,
};

const response = await client.chat(messages, tools, options);

if (response.choices[0].message.reasoning_content) {
  console.log('Reasoning:', response.choices[0].message.reasoning_content);
}
console.log('Answer:', response.choices[0].message.content);
```

### Streaming with Thinking

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
  temperature: 0.8,
};

let fullReasoning = '';
let fullContent = '';

for await (const chunk of client.chatStream(messages, tools, options)) {
  switch (chunk.type) {
    case 'reasoning':
      fullReasoning += chunk.reasoningContent;
      console.log('💭', chunk.reasoningContent);
      break;
    case 'content':
      fullContent += chunk.content;
      console.log('⏺', chunk.content);
      break;
    case 'token_count':
      console.log('Tokens:', chunk.tokenCount);
      break;
  }
}
```

### Error Handling

```typescript
import { validateTemperature, validateMaxTokens, validateThinking } from './grok/types.js';

try {
  validateTemperature(0.7, 'glm-4.6');
  validateMaxTokens(100000, 'glm-4.6');
  validateThinking({ type: 'enabled' }, 'glm-4.6');

  const response = await client.chat(messages, tools, options);
} catch (error) {
  if (error.message.includes('temperature')) {
    console.error('Invalid temperature:', error.message);
  } else if (error.message.includes('max_tokens')) {
    console.error('Invalid max_tokens:', error.message);
  } else if (error.message.includes('thinking')) {
    console.error('Thinking not supported:', error.message);
  }
}
```

### Conditional Thinking

```typescript
function createOptions(complex: boolean): ChatOptions {
  return {
    model: 'glm-4.6',
    thinking: complex ? { type: 'enabled' } : { type: 'disabled' },
    temperature: 0.7,
    maxTokens: complex ? 50000 : 8192,
  };
}

// Simple question - no thinking needed
const simpleOptions = createOptions(false);
const simpleResponse = await client.chat(simpleMessages, [], simpleOptions);

// Complex problem - enable thinking
const complexOptions = createOptions(true);
const complexResponse = await client.chat(complexMessages, [], complexOptions);
```

---

## API Reference

### Types

```typescript
// ChatOptions interface
interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  thinking?: ThinkingConfig;
  stream?: boolean;
}

// ThinkingConfig
interface ThinkingConfig {
  type: 'enabled' | 'disabled';
}

// GLM46Response
interface GLM46Response {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
}

// StreamingChunk
interface StreamingChunk {
  type: 'content' | 'reasoning' | 'tool_calls' | 'tool_result' | 'done' | 'token_count';
  content?: string;
  reasoningContent?: string;
  toolCalls?: GrokToolCall[];
  tokenCount?: number;
}
```

### Validation Functions

```typescript
// Validate temperature for a model
function validateTemperature(temperature: number, model: string): void;

// Validate max tokens for a model
function validateMaxTokens(maxTokens: number, model: string): void;

// Validate thinking parameter for a model
function validateThinking(thinking: ThinkingConfig | undefined, model: string): void;

// Get model configuration
function getModelConfig(model: string): ModelConfig;

// Create default chat options
function createDefaultChatOptions(model?: string): ChatOptions;
```

### Type Guards

```typescript
// Check if response is a valid GLM-4.6 response
function isGLM46Response(response: unknown): response is GLM46Response;

// Check if chunk has reasoning content
function hasReasoningContent(chunk: GLM46StreamChunk): boolean;
```

### Utility Functions

```typescript
// Parse reasoning into steps
function parseReasoningSteps(content: string): string[];
```

---

## Examples

### Example 1: Code Review with Thinking

```typescript
const codeToReview = `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
`;

const messages = [{
  role: 'user',
  content: `Review this code and suggest improvements:

${codeToReview}`
}];

const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
  temperature: 0.6,
  maxTokens: 8192,
};

const response = await client.chat(messages, [], options);

// Output:
// Reasoning: "Let me analyze this code step by step:
// 1. Check for type safety issues
// 2. Look for edge cases
// 3. Consider performance
// 4. Suggest improvements"
//
// Content: "Here are my suggestions:
// 1. Add type annotations for TypeScript
// 2. Handle empty array case
// 3. Consider using a for loop for better performance..."
```

### Example 2: Creative Writing without Thinking

```typescript
const messages = [{
  role: 'user',
  content: 'Write a short story about a robot learning to paint'
}];

const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'disabled' },  // No thinking needed for creativity
  temperature: 0.9,
  maxTokens: 10000,
};

const response = await client.chat(messages, [], options);
```

### Example 3: Long Document Analysis

```typescript
const longDocument = fs.readFileSync('research-paper.txt', 'utf-8');

const messages = [{
  role: 'user',
  content: `Analyze this research paper and provide:
1. Main findings
2. Methodology critique
3. Potential applications

${longDocument}`
}];

const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
  temperature: 0.7,
  maxTokens: 50000,
};

const response = await client.chat(messages, [], options);
```

---

## Troubleshooting

### Common Issues

**Issue**: "Temperature out of range"
```typescript
// Solution: Check model's temperature range
const config = getModelConfig('glm-4.6');
console.log('Temperature range:', config.temperatureRange);
```

**Issue**: "Thinking not supported for this model"
```typescript
// Solution: Check if model supports thinking
const config = getModelConfig(model);
if (config.supportsThinking) {
  options.thinking = { type: 'enabled' };
}
```

**Issue**: "Max tokens exceeds model limit"
```typescript
// Solution: Use model's max output tokens
const config = getModelConfig('glm-4.6');
options.maxTokens = Math.min(requestedTokens, config.maxOutputTokens);
```

---

## Best Practices

1. **Enable thinking for complex tasks**: Use thinking mode for problem-solving, analysis, and debugging
2. **Disable thinking for simple tasks**: Save tokens on straightforward queries
3. **Adjust temperature by use case**: Low for code, medium for conversation, high for creativity
4. **Monitor token usage**: Track consumption to optimize costs
5. **Validate parameters**: Use validation functions to catch errors early
6. **Handle reasoning gracefully**: Check for `reasoning_content` before displaying
7. **Stream long responses**: Use `chatStream` for better UX
8. **Cache model configs**: Avoid repeated lookups with `getModelConfig`

---

## Further Reading

- [GLM-4.6 API Documentation](https://docs.z.ai/guides/llm/glm-4.6)
- [AX CLI README](../README.md)
- [Migration Guide](./glm-4.6-migration-guide.md)
- [API Reference](./api-reference.md)

---

**Questions or Issues?**

Open an issue on [GitHub](https://github.com/defai-digital/ax-cli/issues) or check the [documentation](../README.md).
