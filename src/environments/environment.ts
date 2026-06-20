export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  // Model to request from the backend: 'OPENAI' or 'OLLAMA'
  chatModel: 'OLLAMA' as const,
};
