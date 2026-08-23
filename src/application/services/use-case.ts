export interface RequestContext {
  readonly requestId: string;
  readonly signal: AbortSignal;
}

export interface UseCase<Input, Output> {
  execute(input: Input, context: RequestContext): Promise<Output>;
}
