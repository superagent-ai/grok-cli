# GLM-4.6 Migration Guide

Quick guide for upgrading to GLM-4.6 with thinking mode support.

---

## What's New in GLM-4.6

✅ **Thinking Mode**: See AI's reasoning before the answer
✅ **200K Context**: Process long documents (vs 128K)
✅ **128K Output**: Generate longer responses (vs 4K-8K)
✅ **Configurable Temperature**: 0.6-1.0 range
✅ **30% More Efficient**: Better token utilization

---

## Quick Start

### Before (Old Code)

```typescript
const client = new GrokClient(apiKey);
const response = await client.chat(messages, tools);
```

### After (With GLM-4.6 Features)

```typescript
import type { ChatOptions } from './grok/types.js';

const client = new GrokClient(apiKey);

const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
  temperature: 0.7,
  maxTokens: 8192,
};

const response = await client.chat(messages, tools, options);

// Access reasoning
if (response.choices[0].message.reasoning_content) {
  console.log('Thinking:', response.choices[0].message.reasoning_content);
}
console.log('Answer:', response.choices[0].message.content);
```

---

## Breaking Changes

**None!** All changes are backward compatible.

- Existing code works without modification
- New features are opt-in via `ChatOptions`
- Default model remains `grok-code-fast-1` (configurable)

---

## Migration Steps

### Step 1: Update Types (Optional)

Add type imports for better IntelliSense:

```typescript
import type { ChatOptions, ThinkingConfig } from './grok/types.js';
```

### Step 2: Enable Thinking Mode

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
};
```

### Step 3: Handle Reasoning Content

```typescript
const response = await client.chat(messages, tools, options);

// Check for reasoning
const reasoning = response.choices[0].message.reasoning_content;
if (reasoning) {
  console.log('AI Thinking:', reasoning);
}
```

### Step 4: Adjust Max Tokens (If Needed)

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  maxTokens: 50000,  // Up to 128K for glm-4.6
};
```

---

## Common Scenarios

### Scenario 1: Simple Chat (No Changes Needed)

```typescript
// This still works exactly as before
const response = await client.chat(messages, tools);
```

### Scenario 2: Enable Thinking for Complex Tasks

```typescript
const isComplexTask = true;

const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: isComplexTask ? { type: 'enabled' } : { type: 'disabled' },
};

const response = await client.chat(messages, tools, options);
```

### Scenario 3: Streaming with Reasoning

```typescript
const options: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
};

for await (const chunk of client.chatStream(messages, tools, options)) {
  if (chunk.type === 'reasoning') {
    console.log('💭', chunk.reasoningContent);
  } else if (chunk.type === 'content') {
    console.log('⏺', chunk.content);
  }
}
```

---

## Model Comparison

| Feature | grok-code-fast-1 | glm-4.6 |
|---------|------------------|---------|
| Context Window | 128K | 200K |
| Max Output | 4K | 128K |
| Thinking Mode | ❌ | ✅ |
| Temperature Range | 0.0-2.0 | 0.6-1.0 |
| Best For | Fast coding | Complex reasoning |

---

## Validation

GLM-4.6 validates parameters automatically:

```typescript
// Temperature must be 0.6-1.0 for glm-4.6
validateTemperature(0.5, 'glm-4.6');  // ❌ Error
validateTemperature(0.7, 'glm-4.6');  // ✅ OK

// Max tokens must not exceed 128K
validateMaxTokens(150000, 'glm-4.6');  // ❌ Error
validateMaxTokens(100000, 'glm-4.6');  // ✅ OK

// Thinking only on glm-4.6
validateThinking({ type: 'enabled' }, 'grok-code-fast-1');  // ❌ Error
validateThinking({ type: 'enabled' }, 'glm-4.6');  // ✅ OK
```

---

## Best Practices

1. **Start with thinking disabled** - Enable only for complex tasks
2. **Use default maxTokens (8192)** - Increase only when needed
3. **Keep temperature at 0.7** - Adjust based on use case
4. **Check `reasoning_content` exists** - Not all responses include it
5. **Stream long responses** - Better UX for large outputs

---

## Testing Your Migration

```typescript
// 1. Test basic chat still works
const basicResponse = await client.chat(messages, tools);
console.assert(basicResponse.choices[0].message.content);

// 2. Test thinking mode
const thinkingOptions: ChatOptions = {
  model: 'glm-4.6',
  thinking: { type: 'enabled' },
};
const thinkingResponse = await client.chat(messages, tools, thinkingOptions);
console.assert(thinkingResponse.choices[0].message.reasoning_content);

// 3. Test validation
try {
  validateTemperature(0.5, 'glm-4.6');
  console.error('Validation should have failed!');
} catch (error) {
  console.log('✅ Validation working correctly');
}
```

---

## Troubleshooting

**Q: My code broke after updating**
A: GLM-4.6 features are backward compatible. Existing code should work without changes.

**Q: I'm not seeing reasoning_content**
A: Ensure you've enabled thinking mode: `thinking: { type: 'enabled' }`

**Q: Getting "temperature out of range" error**
A: GLM-4.6 requires 0.6-1.0. Check your temperature value.

**Q: Thinking mode not working**
A: Verify you're using `model: 'glm-4.6'`. Other models don't support thinking.

---

## Example: Full Migration

### Before

```typescript
import { GrokClient } from './grok/client.js';

const client = new GrokClient(process.env.GROK_API_KEY!);

async function askQuestion(question: string) {
  const messages = [{ role: 'user', content: question }];
  const response = await client.chat(messages, []);
  return response.choices[0].message.content;
}
```

### After

```typescript
import { GrokClient } from './grok/client.js';
import type { ChatOptions } from './grok/types.js';

const client = new GrokClient(process.env.GROK_API_KEY!);

async function askQuestion(question: string, enableThinking = false) {
  const messages = [{ role: 'user', content: question }];

  const options: ChatOptions = {
    model: 'glm-4.6',
    thinking: enableThinking ? { type: 'enabled' } : { type: 'disabled' },
    temperature: 0.7,
    maxTokens: 8192,
  };

  const response = await client.chat(messages, [], options);

  return {
    answer: response.choices[0].message.content,
    reasoning: response.choices[0].message.reasoning_content,
  };
}

// Usage
const result = await askQuestion('Explain recursion', true);
console.log('Thinking:', result.reasoning);
console.log('Answer:', result.answer);
```

---

## Further Resources

- [GLM-4.6 Usage Guide](./glm-4.6-usage-guide.md)
- [API Reference](../README.md#api-reference)
- [GLM-4.6 Official Docs](https://docs.z.ai/guides/llm/glm-4.6)

---

**Need Help?**

Open an issue: https://github.com/defai-digital/ax-cli/issues
