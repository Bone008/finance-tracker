import { Component, EventEmitter, HostBinding, HostListener, Input, Output } from '@angular/core';
import { coerceBooleanProperty } from 'src/app/core/util';

/**
 * Renders a label chip, which can optionally be clicked and deleted.
 */
@Component({
  selector: 'app-label',
  templateUrl: './label-chip.component.html',
  styleUrls: ['./label-chip.component.css']
})
export class LabelChipComponent {
  private _inline = false;
  private _canClick = false;
  private _canDelete = false;

  @Input() @HostBinding('class.inline')
  get inline() { return this._inline; }
  set inline(value: boolean) { this._inline = coerceBooleanProperty(value); }
  @Input() @HostBinding('class.clickable')
  get canClick() { return this._canClick; }
  set canClick(value: boolean) { this._canClick = coerceBooleanProperty(value); }
  @Input()
  get canDelete() { return this._canDelete; }
  set canDelete(value: boolean) { this._canDelete = coerceBooleanProperty(value); }

  //@Output() click = new EventEmitter<MouseEvent>();
  /** Emitted when the user requests deletion of the label. */
  @Output() delete = new EventEmitter<MouseEvent | KeyboardEvent>();


  @HostBinding('attr.tabindex')
  get tabindex(): number | null {
    return this.canClick ? 0 : null;
  }


  @HostListener('keydown.delete')
  onDelete(event: KeyboardEvent) {
    this.delete.emit(event);
  }
}