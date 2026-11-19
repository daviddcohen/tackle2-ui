/**
 * Removes ANSI escape sequences (colors, cursor moves, terminal titles) from
 * text a tool printed, for views that show it as plain text. The log viewer
 * renders ANSI colors itself, so only plain text views need this.
 */
// CSI: ESC [ parameters, intermediates, final byte (colors, cursor moves).
// OSC: ESC ] ... ended by BEL or ESC \ (titles, hyperlinks).
// Other two-character escapes: ESC and one byte.
export const ANSI =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export const stripAnsi = (text: string) => text.replace(ANSI, "");
