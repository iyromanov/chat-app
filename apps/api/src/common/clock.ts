export abstract class Clock {
  abstract now(): Date;
  scheduleAt(at: Date, callback: () => void): () => void {
    const timer = setTimeout(
      callback,
      Math.max(0, at.getTime() - this.now().getTime()),
    );
    timer.unref();
    return () => clearTimeout(timer);
  }
}
export class SystemClock extends Clock {
  now() {
    return new Date();
  }
}
