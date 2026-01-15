export type ProtocolDiagram = {
  id: string;
  title: string;
  subtitle: string;
  code: string;
};

export const protocolDiagrams: ProtocolDiagram[] = [
  {
    id: "streamdown",
    title: "Scenario A: Streamdown",
    subtitle: "Streaming markdown to DOM",
    code: `sequenceDiagram
    participant UI as Web UI
    participant A2A as A2A Agent
    participant LLM as OpenRouter
    participant SD as Streamdown

    UI->>+A2A: POST /v1/message:stream
    Note over UI,A2A: Accept: text/event-stream
    A2A->>+LLM: POST /chat/completions
    Note over A2A,LLM: stream: true
    loop SSE chunks
        LLM-->>A2A: data: {"delta": "markdown..."}
        A2A-->>SD: markdown fragment
        SD-->>UI: sanitized DOM node
    end
    LLM->>-A2A: data: [DONE]
    A2A->>-UI: stream complete`,
  },
  {
    id: "a2ui",
    title: "Scenario B: A2UI",
    subtitle: "Schema-driven form workflow",
    code: `sequenceDiagram
    participant UI as Web UI
    participant A2A as A2A Agent
    participant R as A2UI Renderer

    UI->>+A2A: POST /v1/message:stream
    Note over UI,A2A: X-A2UI-Extension: true
    A2A-->>R: beginRendering
    Note over A2A,R: {schema: FormSchema, data: {}}
    R-->>UI: rendered form component
    Note over UI: User fills form
    UI->>A2A: submit_form
    Note over UI,A2A: {name, email, project, priority}
    A2A->>-UI: POST /v1/message:send
    Note over A2A,UI: {status: "confirmed"}`,
  },
  {
    id: "mcp",
    title: "Scenario C: MCP",
    subtitle: "Tool plan, approval, and resume",
    code: `sequenceDiagram
    participant UI as Web UI
    participant A2A as A2A Agent
    participant Gate as Approval Gate
    participant MCP as MCP Server
    participant Tool as Tool

    UI->>+A2A: POST /v1/message:stream
    Note over UI,A2A: {task: "query database"}
    A2A-->>Gate: tool_plan
    Note over A2A,Gate: [{tool: "sql_query", params: {...}}]
    Note over Gate: User reviews plan
    Gate->>A2A: {approved: true}
    A2A->>+MCP: tools/call
    Note over A2A,MCP: {name: "sql_query", args: {...}}
    MCP->>+Tool: execute
    Tool->>-MCP: result rows
    MCP->>-A2A: tool_result
    Note over MCP,A2A: {data: [...]}
    A2A->>-UI: SSE: formatted results

    rect rgb(255, 245, 230)
    Note over UI,MCP: Resume flow (after disconnect)
    UI->>MCP: POST /mcp
    Note over UI,MCP: Last-Event-ID: 42
    MCP-->>UI: Mcp-Session-Id + events[43...]
    end`,
  },
  {
    id: "json-render",
    title: "Scenario D: json-render",
    subtitle: "Catalog-guarded UI generation",
    code: `sequenceDiagram
    participant P as Prompt + Catalog
    participant LLM as LLM
    participant JR as json-render
    participant UI as Live UI
    participant Data as Data Source

    P->>LLM: system: catalog.json
    Note over P,LLM: allowed components
    P->>LLM: user: "show metrics"
    LLM->>JR: JSON UI Tree
    Note over LLM,JR: {type: "Card", children: [...]}
    JR->>UI: React.createElement(Card, ...)
    Data-->>UI: {revenue: 132900, rate: 16.3}
    Note over UI: Data bindings update without re-render`,
  },
];

export const protocolMatrix = [
  {
    dimension: "Transport",
    streamdown: "SSE",
    a2ui: "SSE + actions",
    mcp: "SSE + resume",
    jsonRender: "One-shot",
  },
  {
    dimension: "User input",
    streamdown: "None",
    a2ui: "Typed forms",
    mcp: "Approval gate",
    jsonRender: "None",
  },
  {
    dimension: "Rendering",
    streamdown: "Markdown to DOM",
    a2ui: "Schema to React",
    mcp: "Results panel",
    jsonRender: "JSON to React",
  },
  {
    dimension: "Security",
    streamdown: "rehype-harden",
    a2ui: "Schema validation",
    mcp: "HITL approval",
    jsonRender: "Catalog allowlist",
  },
];
