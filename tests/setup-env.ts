// Runs before each test file. Flow tests use the offline mock mode (the app
// defaults to REST) without artificial latency, so UI tests are fast.
process.env.EXPO_PUBLIC_MOCK_LATENCY_MS = '0';
process.env.EXPO_PUBLIC_DATA_MODE = 'mock';
