import { ITransactionData } from "../../../proto/model";

export interface FormatMapping {
  transactionKey: keyof ITransactionData;
  column: string;
  converterCallback?: (rawValue: string) => any;
}

export class MappingBuilder<R> {
  private mappings: FormatMapping[] = [];

  addMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ column: keyof R,
      /**/ converterCallback?: (rawValue: string) => ITransactionData[K]): MappingBuilder<R> {
    this.mappings.push({ transactionKey, column: <string>column, converterCallback });
    return this;
  }

  addConstantMapping<K extends keyof ITransactionData>(
      /**/ transactionKey: K,
      /**/ constantValue: ITransactionData[K]): MappingBuilder<R> {
    // TODO implement constant mappings properly
    this.mappings.push({
      transactionKey,
      column: this.mappings[0].column,
      converterCallback: _ => constantValue
    });
    return this;
  }


  build(): FormatMapping[] {
    return this.mappings;
  }
}
