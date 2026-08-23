export interface ResultWarning {
  readonly code: string;
  readonly message: string;
  readonly affectedFields?: readonly string[] | undefined;
}
