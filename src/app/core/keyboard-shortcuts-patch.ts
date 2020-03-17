import { AllowIn, ShortcutInput } from "ng-keyboard-shortcuts";

const WHITELISTED_HTML_INPUT_TYPES =
  ['button', 'checkbox', 'image', 'radio', 'reset', 'submit'];

/** Patches a list of shortcuts in-place to apply custom general logic. */
export function patchShortcuts(shortcuts: ShortcutInput[]): ShortcutInput[] {
  for (const shortcut of shortcuts) {
    patchShortcut(shortcut);
  }
  return shortcuts;
}

/** Patches a shortcut in-place to apply custom general logic. */
export function patchShortcut(shortcut: ShortcutInput): ShortcutInput {
  if (shortcut.allowIn && shortcut.allowIn.includes(AllowIn.Input))
    return shortcut;

  shortcut.allowIn = shortcut.allowIn || [];
  shortcut.allowIn.push(AllowIn.Input);
  // Monkey-patch command function to filter for input targets manually, but more specifically.
  const realCommand = shortcut.command;
  shortcut.command = event => {
    const target = event.event.target as HTMLInputElement;
    if (!(target instanceof HTMLInputElement) || WHITELISTED_HTML_INPUT_TYPES.includes(target.type)) {
      return realCommand(event);
    }
  };
  return shortcut;
}
