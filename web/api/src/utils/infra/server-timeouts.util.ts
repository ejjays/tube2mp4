interface TimeoutConfigurable {
  timeout: number;
  keepAliveTimeout: number;
  headersTimeout: number;
  requestTimeout: number;
}

// split timeouts by phase to resist slowloris
export function configureServerTimeouts(server: TimeoutConfigurable): void {
  // 20 min: long-lived 4K download responses
  server.timeout = 1200000;
  // 60s window prevents slowloris
  server.requestTimeout = 60000;
  server.headersTimeout = 60000;
  // below headersTimeout: node premature-close race guard
  server.keepAliveTimeout = 55000;
}
