import { ITransactionData } from "../../../proto/model";

/**
 * Stores config that describes how to map the columns of a file format to
 * a TransactionData entity.
 */
export interface FormatMapping {
  /** Optional regular expression that matches where the actual CSV header starts. */
  readonly startPattern?: RegExp;
  readonly requiredColumns: string[];
  readonly mappings: { [K in keyof ITransactionData]: (row: { [column: string]: string }) => any };
  readonly rowFilter?: (row: { [column: string]: string }) => boolean;
}

/** Utility for configuring FormatMapping instances. */
export class FormatMappingBuilder<R> {

  private requiredColumns: string[] = [];
  private mappings: { [K in keyof ITransactionData]: (row: R) => any } = {};
  private startPattern: RegExp | undefined = undefined;
  private rowFilter?: (row: R) => boolean;

  addMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ column: keyof R,
      /**/ converterCallback?: (rawValue: string) => ITransactionData[K]): this {
    if (converterCallback) {
      this.mappings[transactionKey] = row => converterCallback(String(row[column]));
    } else {
      this.mappings[transactionKey] = row => row[column];
    }

    this.requiredColumns.push(String(column));
    return this;
  }

  addRawMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ requiredColumns: (keyof R)[],
      /**/ mappingCallback: (row: R) => ITransactionData[K]): this {
    this.mappings[transactionKey] = mappingCallback;
    this.requiredColumns.push(...<string[]>requiredColumns);
    return this;
  }

  addConstantMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ constantValue: ITransactionData[K]): this {
    this.mappings[transactionKey] = _ => constantValue;
    return this;
  }

  skipUntilPattern(regex: RegExp): this {
    this.startPattern = regex;
    return this;
  }

  setRowFilter(callback: (row: R) => boolean): this {
    this.rowFilter = callback;
    return this;
  }

  build(): FormatMapping {
    // Strip away strong typing based on R, since it has no use during the
    // dynamic mapping that clients of this class perform.
    // The strong typing of R is only used for type-safe construction within
    // this builder.
    return {
      startPattern: this.startPattern,
      requiredColumns: this.requiredColumns,
      mappings: <FormatMapping['mappings']><any>this.mappings,
      rowFilter: <FormatMapping['rowFilter']><any>this.rowFilter,
    };
  }
}
