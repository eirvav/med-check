export class UpstreamUnavailableError extends Error {
  readonly code = "UPSTREAM_UNAVAILABLE";
}

export class ParsingFailedError extends Error {
  readonly code = "PARSING_FAILED";
}
