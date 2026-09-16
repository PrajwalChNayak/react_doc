// Required since Next.js 16: the build fails if a slot has no default.
// Rendered when the slot has no match on a hard navigation.
export default function ModalDefault() {
  return null
}
