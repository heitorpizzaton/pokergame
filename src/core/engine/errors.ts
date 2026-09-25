export type EngineErrorCode =
  | 'InvalidConfig'
  | 'HandInProgress'
  | 'NoHandInProgress'
  | 'GameOver'
  | 'NotYourTurn'
  | 'FoldWhenCheckAvailable'
  | 'IllegalAction'
  | 'InvalidAmount'
  | 'InvalidSnapshot';

/** Every rejected command throws this typed error; the engine never silently corrects input. */
export class EngineError extends Error {
  override readonly name = 'EngineError';

  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
  }
}
