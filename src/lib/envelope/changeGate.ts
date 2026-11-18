/** True when the value differs from the last one let through (the first always passes). */
export function changeGate(epsilon = 1e-5): (next: number) => boolean {
  let last: number | null = null;
  return (next) => {
    if (last !== null && Math.abs(next - last) < epsilon) return false;
    last = next;
    return true;
  };
}
