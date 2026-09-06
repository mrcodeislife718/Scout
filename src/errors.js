export class ScoutSyntaxError extends SyntaxError {
  constructor(message, position) {
    const suffix = position ? ` at ${position.line}:${position.column}` : '';
    super(`${message}${suffix}`);
    this.name = 'ScoutSyntaxError';
    if (position) {
      this.position = { ...position };
      Object.assign(this, position);
    }
  }
}
