// Runs before each test file. Remove artificial mock latency so UI tests are fast.
process.env.EXPO_PUBLIC_MOCK_LATENCY_MS = '0';
