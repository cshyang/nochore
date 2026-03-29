# Tool Design & Schema Guide

## Table of Contents

1. [Parameter Schemas](#parameter-schemas)
2. [Argument Parsing Pipeline](#argument-parsing-pipeline)
3. [AJV Validation & Coercion](#ajv-validation--coercion)
4. [Loose Schema Pitfall](#loose-schema-pitfall)
5. [Boundary Parsing Pattern](#boundary-parsing-pattern)
6. [Schema Design Guidelines](#schema-design-guidelines)

## Parameter Schemas

Tool parameters accept **TypeBox schemas** or **plain JSON Schema objects** — they're structurally compatible:

```typescript
// TypeBox (if @sinclair/typebox is available)
import { Type } from "@sinclair/typebox";
const params = Type.Object({ name: Type.String(), count: Type.Number() });

// Plain JSON Schema (always works, no dependency)
const params = {
  type: "object" as const,
  required: ["name", "count"],
  properties: {
    name: { type: "string" as const },
    count: { type: "number" as const },
  },
};
```

Both work identically in `AgentTool.parameters` and `ToolDefinition.parameters`.

## Argument Parsing Pipeline

When the LLM returns a tool call, arguments flow through two stages:

```
LLM response (JSON tool_use block)
  → Stage 1: parseStreamingJson() — JSON.parse, fallback to partial-json library
  → ToolCall.arguments stored as parsed JS object
  → Stage 2: validateToolArguments() — AJV validation with coerceTypes: true
  → tool.execute() receives validated, coerced params
```

Source: `pi-ai/dist/utils/json-parse.js` (Stage 1), `pi-ai/dist/utils/validation.js` (Stage 2).

If parsing fails → empty object `{}`. If validation fails → tool never executes, error result returned.

## AJV Validation & Coercion

- AJV runs with `coerceTypes: true` — it mutates arguments in-place
- Coercion examples: string `"42"` → number `42` if schema says `type: "number"`
- Only coerces when the schema declares a specific type
- For loose schemas (`{}`), no coercion occurs — anything passes

## Loose Schema Pitfall

**Problem:** When a parameter schema is `{}` (any type), the LLM has no type guidance. It may serialize complex nested data as a JSON **string** rather than an inline object.

```typescript
// This schema gives no type hint for data:
const params = {
  type: "object" as const,
  properties: {
    cardType: { type: "string" as const },
    data: {},  // ← "any" — LLM may serialize as string
  },
};

// LLM might produce either:
// Good: { "cardType": "questions", "data": [{"id": "q1", ...}] }
// Bad:  { "cardType": "questions", "data": "[{\"id\": \"q1\", ...}]" }
```

Both are valid JSON. AJV accepts both. The tool receives either an array or a string.

**Why this happens:** The LLM sees a complex nested structure with no schema constraint and wraps it as a string for "safety." This is LLM behavior, not a framework bug.

## Boundary Parsing Pattern

When accepting loosely-typed tool output, always parse strings at the consumer boundary:

```typescript
// In the consumer (frontend, parent agent, etc.)
let cardData = event.data;
if (typeof cardData === "string") {
  try { cardData = JSON.parse(cardData); } catch { /* use as-is */ }
}
```

This is the pi-mono recommended approach (see [pi-mono#1086](https://github.com/badlogic/pi-mono/issues/1086)): use tools for structured output, but validate/parse at the consumer. The framework intentionally avoids provider-specific structured output enforcement.

## Schema Design Guidelines

**Be specific about types.** The LLM reads schemas to decide output format:

```typescript
// Bad — LLM guesses the type
data: {}

// Better — LLM knows to produce an array
data: { type: "array" as const, items: {} }

// Best — LLM knows exact shape
data: {
  type: "array" as const,
  items: {
    type: "object" as const,
    properties: {
      questionId: { type: "string" as const },
      title: { type: "string" as const },
    },
  },
}
```

**When loose schemas are unavoidable** (e.g., polymorphic `data` field that varies by card type):
1. Document expected shapes in the tool **description** with concrete JSON examples
2. Apply the boundary parsing pattern at the consumer
3. Add defensive guards in rendering code (`?? []`, `Array.isArray()`)

**The tool description is your best lever.** The LLM reads it to understand what to produce. Explicit JSON examples in the description compensate for loose schemas:

```typescript
description: `Present a card. Card types and data schemas:
"questions_batch" — data is an ARRAY: [{ "questionId": "q1", "title": "...", "options": ["A", "B"] }]
"summary" — data is an OBJECT: { "title": "...", "highlights": ["..."] }`
```
