export function openFocusedAssistant(trigger: Pick<HTMLElement,'focus'>, open: () => void): void {
  trigger.focus();
  open();
}
