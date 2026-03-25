export function supportsHtmlApps(clientCapabilities?: any): boolean {
  return false;
}

export function getContentType(supportsHtml: boolean): string {
  return supportsHtml ? 'text/html;profile=mcp-app' : 'text/plain';
}
