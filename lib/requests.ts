/**
 * clipboard's instance request surface: the `ags request` control path.
 *
 * WHY THIS IS A PURE MODULE. `ags bundle` transpiles without type-checking, and
 * a request handler that silently does nothing still bundles -- so the mapping
 * from a request name to a window action has to be *executed* by a gate. The
 * window is injected here as a small controls interface, so the gate can drive
 * the real mapping with no `gi://`/`ags` import (which only a live desktop
 * stack can resolve). `app.tsx` binds these controls to the overlay window.
 *
 * Shape mirrors `bar/app.tsx`'s requestHandler: `(argv, res)`.
 */

/** The one thing the request surface needs from the overlay window. */
export interface ClipboardWindowControls {
  show(): void
  hide(): void
  toggle(): void
}

/**
 * Handle one `ags request` invocation, calling `res` exactly once.
 *
 * `popup-close` is the bar's name for the global Escape dismissal: the same
 * Hyprland keybind runs `ags request popup-close` against whichever instance is
 * focused, so clipboard accepts it and hides. `hide` is the explicit spelling;
 * `show`/`toggle` cover the launcher (its start-if-down path can only *start*
 * the instance, so it needs `show` to reveal the freshly started window, and
 * `toggle` mirrors the `ags toggle` window command). An unknown request is
 * named back, mirroring `bar/app.tsx`.
 */
export function handleRequest(
  argv: string[],
  res: (response: string) => void,
  controls: ClipboardWindowControls,
): void {
  const name = argv[0]
  if (name === "toggle") {
    controls.toggle()
    res("ok")
    return
  }
  if (name === "show") {
    controls.show()
    res("ok")
    return
  }
  if (name === "hide" || name === "popup-close") {
    controls.hide()
    res("ok")
    return
  }
  res(`unknown request: ${argv.join(" ")}`)
}
