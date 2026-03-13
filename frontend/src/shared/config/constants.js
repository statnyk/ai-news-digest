// Frontend must call the Node API (which then forwards to n8n). Do not use N8N_WEBHOOK_BASE_URL here.
export const API_BASE = import.meta.env.VITE_API_URL || "";

export const DIGEST_RANGES = [
  { value: "5m", label: "Last 5 minutes" },
  { value: "30m", label: "Last 30 minutes" },
  { value: "1h", label: "Last 1 hour" },
  { value: "1d", label: "Last 1 day" },
  { value: "3d", label: "Last 3 days" },
  { value: "1w", label: "Last 1 week" },
];

export const QUESTION_POOL = [
  "What are the latest AI news?",
  "Tell me about recent LLM developments",
  "What's new in machine learning research?",
  "Any breakthroughs in computer vision?",
  "What are companies doing with generative AI?",
  "Are there concerns about AI safety recently?",
  "What open-source AI models were released?",
  "Tell me about AI regulation news",
  "What's happening in robotics and AI?",
  "Any news about AI in healthcare?",
  "What AI startups raised funding recently?",
  "How is AI being used in education?",
];
