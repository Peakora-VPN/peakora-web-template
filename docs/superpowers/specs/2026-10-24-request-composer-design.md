# Request composer

Add a polished request composer opened from the contact section. The user wants
normal public-facing copy without demo labels and explicitly wants no actual
submission. The final flow uses Send request followed by a short thank-you screen;
there is no review/edit step and no claim of delivery.

Use a native modal dialog for focus containment, Escape and focus restoration.
The form uses `method="dialog"`, no action, and intercepted submission. This
preserves the existing `form-action 'none'` CSP and cannot transmit form values.
The opener is hidden until initialized; static contact email remains available.

Fields: required topic (network enquiry, technical issue, abuse report), name
(2–80 characters), email (browser email validity, maximum 254), subject (6–120)
and description (30–2000). Trimmed values must meet minimum lengths; long values
and whitespace-only input are rejected. Use inline English errors, associated
labels/descriptions, an error summary and focus on the first invalid field.

The completion screen contains a static thank-you message and Close button.
Closing clears form values and validation and restores the initial view. No requests, storage,
clipboard side effects, fake acknowledgements or ticket numbers. Use existing
fonts, dark panels and blue interaction color; errors use an accessible red.

Verify empty/malformed/short/whitespace input, correction, Unicode names, topic
choice, boundary lengths, completion after valid input, reset, keyboard,
mobile layout, no-JS fallback and zero submit/navigation/network side effects.
