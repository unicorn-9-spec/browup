// Log redaction for the main process: the API key (and anything shaped like
// "apiKey: …") never reaches a log line. (From Upbeat.)

export function redact(msg: string, key: string | null): string {
  let out = msg;
  if (key && key.length >= 4) out = out.split(key).join('[redacted]');
  return out.replace(/(api[_-]?key["'\s:=]+)[^\s"',}]+/gi, '$1[redacted]');
}
