import { ITransactionData } from "../../../proto/model";

/**
 * Stores config that describes how to map the columns of a file format to
 * a TransactionData entity.
 */
export interface FormatMapping {
  readonly requiredColumns: string[];
  readonly mappings: { [K in keyof ITransactionData]: (row: { [column: string]: string }) => any };
}

/** Utility for configuring FormatMapping instances. */
export class FormatMappingBuilder<R> {

  private requiredColumns: string[] = [];
  private mappings: { [K in keyof ITransactionData]: (row: R) => any } = {};

  addMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ column: keyof R,
      /**/ converterCallback?: (rawValue: string) => ITransactionData[K]): FormatMappingBuilder<R> {
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
      /**/ mappingCallback: (row: R) => ITransactionData[K]): FormatMappingBuilder<R> {
    this.mappings[transactionKey] = mappingCallback;
    this.requiredColumns.push(...<string[]>requiredColumns);
    return this;
  }

  addConstantMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ constantValue: ITransactionData[K]): FormatMappingBuilder<R> {
    this.mappings[transactionKey] = _ => constantValue;
    return this;
  }

  build(): FormatMapping {
    return {
      requiredColumns: this.requiredColumns,
      // Strip away strong typing based on R, since it has no use during the
      // dynamic mapping that clients of this class perform.
      // The strong typing of R is only used for type-safe construction within
      // this builder.
      mappings: <FormatMapping['mappings']>this.mappings,
    };
  }
}
