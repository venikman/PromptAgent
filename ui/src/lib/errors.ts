/**
 * Shared error categorization utilities for human-friendly error messages.
 */

export type ErrorCategory = "timeout" | "rate_limit" | "connection" | "json_parse" | "llm_error" | "missing_data" | "unknown";

export type ErrorInfo = {
  category: ErrorCategory;
  title: string;
  /** User-friendly explanation of what went wrong */
  suggestion: string;
  /** Alias for suggestion (for Playground compatibility) */
  message: string;
  /** Actionable advice for the user */
  action: string;
  icon: "warning" | "error";
};

/**
 * Categorize an error string into a user-friendly error info object.
 * Used across Playground, Evaluation, and Evolution flows.
 */
export function categorizeError(error: string): ErrorInfo {
  const lower = error.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
    return {
      category: "timeout",
      title: "Request Timeout",
      suggestion: "The LLM took too long to respond. Try again or reduce the complexity.",
      message: "The model took too long to respond.",
      action: "Try again with a simpler prompt",
      icon: "warning",
    };
  }

  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return {
      category: "rate_limit",
      title: "Rate Limited",
      suggestion: "Too many requests. Wait a moment before retrying.",
      message: "Too many requests in a short time.",
      action: "Wait a moment and try again",
      icon: "warning",
    };
  }

  if (lower.includes("econnrefused") || lower.includes("connection refused") || lower.includes("fetch failed")) {
    return {
      category: "connection",
      title: "Connection Failed",
      suggestion: "Cannot reach the LLM server. Make sure LM Studio or your LLM provider is running.",
      message: "Make sure LM Studio or your model server is running on localhost:1234.",
      action: "Start the LLM server and try again",
      icon: "error",
    };
  }

  if (lower.includes("unexpected token") || lower.includes("json") || lower.includes("parse")) {
    return {
      category: "json_parse",
      title: "Invalid Response Format",
      suggestion: "The model returned invalid data. Try again - it usually works on retry.",
      message: "The AI generated text instead of structured data. This happens occasionally.",
      action: "Try again - the model will likely succeed on retry",
      icon: "warning",
    };
  }

  if (lower.includes("llm_error") || lower.includes("model")) {
    return {
      category: "llm_error",
      title: "LLM Error",
      suggestion: "The language model encountered an error. Check your model configuration.",
      message: "The language model encountered an error.",
      action: "Check your model configuration",
      icon: "error",
    };
  }

  if (lower.includes("no epics") || lower.includes("not found") || lower.includes("missing")) {
    return {
      category: "missing_data",
      title: "Missing Data",
      suggestion: "Required data not found. Check your configuration.",
      message: "Required data not found.",
      action: "Check your configuration files",
      icon: "error",
    };
  }

  return {
    category: "unknown",
    title: "Operation Failed",
    suggestion: "An unexpected error occurred. Check the console for details.",
    message: error.slice(0, 100),
    action: "Try again or check the console for details",
    icon: "error",
  };
}
