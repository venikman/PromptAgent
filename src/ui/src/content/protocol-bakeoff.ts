export type ProtocolDiagram = {
  id: string;
  title: string;
  subtitle: string;
  code: string;
};

export const protocolDiagrams: ProtocolDiagram[] = [
  {
    id: "overview",
    title: "Overview",
    subtitle: "All scenarios, side by side",
    code: `flowchart TB
    subgraph A["Scenario A: Streamdown"]
        A1[Web UI] -->|"prompt + Accept: text/event-stream"| A2[A2A Agent]
        A2 -->|"POST /chat/completions"| A3[OpenRouter LLM]
        A3 -->|"SSE chunks: data: {delta}"| A2
        A2 -->|"SSE: markdown fragments"| A4[Streamdown Renderer]
        A4 -->|"sanitized DOM nodes"| A1
    end

    subgraph B["Scenario B: A2UI Structured"]
        B1[Web UI] -->|"X-A2UI-Extension header"| B2[A2A Agent]
        B2 -->|"beginRendering + JSON schema"| B3[A2UI Renderer]
        B3 -->|"rendered form + data model"| B1
        B1 -->|"submit_form payload"| B2
        B2 -->|"POST /v1/message:send"| B4[Confirmation]
    end

    subgraph C["Scenario C: MCP Orchestration"]
        C1[Web UI] -->|"task request"| C2[A2A Agent]
        C2 -->|"tool_plan proposal"| C3[Approval Gate]
        C3 -->|"approved: true"| C4[MCP Server]
        C4 -->|"tools/call + params"| C5[Tool Execution]
        C5 -->|"tool_result JSON"| C4
        C4 -->|"SSE results"| C1
    end

    subgraph D["Scenario D: json-render"]
        D1[Prompt + Catalog] -->|"component allowlist"| D2[LLM]
        D2 -->|"JSON UI tree"| D3[json-render]
        D3 -->|"React elements"| D4[Live UI]
        D4 -.->|"data binding updates"| D4
    end

    style A fill:#fef3c7,stroke:#f59e0b
    style B fill:#dbeafe,stroke:#3b82f6
    style C fill:#dcfce7,stroke:#22c55e
    style D fill:#f3e8ff,stroke:#a855f7`,
  },
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
