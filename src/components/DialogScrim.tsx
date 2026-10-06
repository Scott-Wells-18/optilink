/**
 * The dimmed backdrop behind a dialog.
 *
 * It is deliberately not a way out.
 *
 * It used to be a button that closed the dialog, which is the usual web
 * convention and the wrong one here. These dialogs are forms filled in on a
 * phone, on site, one-handed, often with a dozen fields and a set of
 * photographs in them — and the backdrop is the largest target on the screen.
 * A thumb landing an inch wide of the box threw the lot away without asking.
 *
 * So the way out of a dialog is to say so: Cancel, Save, or Done. The backdrop
 * still covers the screen and still swallows the click, so nothing behind the
 * dialog can be pressed through it; it simply does not act on it.
 *
 * Escape still closes, because it is a deliberate keystroke rather than a slip
 * of the thumb, and taking it away would leave somebody working by keyboard
 * with no way to dismiss a dialog at all.
 */
export function DialogScrim() {
  return <div className="dialog-scrim" aria-hidden />;
}
