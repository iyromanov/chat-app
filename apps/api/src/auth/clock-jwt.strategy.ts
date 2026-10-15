import type { Request } from 'express';
import {
  Strategy,
  type StrategyOptionsWithRequest,
  type VerifyCallbackWithRequest,
} from 'passport-jwt';
import { Clock } from '../common/clock';

// passport-jwt copies verification options on construction. Create a verifier
// per authentication so clockTimestamp follows the application clock.
export class ClockJwtStrategy extends Strategy {
  constructor(
    private readonly options: StrategyOptionsWithRequest & { clock: Clock },
    private readonly verifyUser: VerifyCallbackWithRequest,
  ) {
    super(options, verifyUser);
  }

  authenticate(request: Request) {
    const strategy = new Strategy(
      {
        ...this.options,
        jsonWebTokenOptions: {
          clockTimestamp: Math.floor(this.options.clock.now().getTime() / 1000),
        },
      },
      this.verifyUser,
    );
    strategy.success = this.success.bind(this);
    strategy.fail = this.fail.bind(this);
    strategy.error = this.error.bind(this);
    strategy.authenticate(request);
  }
}
