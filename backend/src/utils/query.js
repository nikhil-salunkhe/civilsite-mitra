/**
 * Query helpers shared by every list endpoint.
 */

/**
 * Escapes user input before it is used inside a RegExp so characters like
 * `(` `[` `*` can never produce an "Invalid regular expression" 500.
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };