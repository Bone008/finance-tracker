import { Directive } from "@angular/core";
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from "@angular/forms";
import { TransactionFilterService } from "../transaction-filter.service";

@Directive({
  selector: '[filterFormatValidator]',
  providers: [{ provide: NG_VALIDATORS, useExisting: FilterFormatValidatorDirective, multi: true }]
})
export class FilterFormatValidatorDirective implements Validator {
  constructor(private readonly filterService: TransactionFilterService) { }

  validate(control: AbstractControl): ValidationErrors | null {
    const errors = this.filterService.validateFilter(control.value);
    if (errors.length > 0) {
      return { filterFormat: errors.join(', ') };
    } else {
      return null;
    }
  }
}