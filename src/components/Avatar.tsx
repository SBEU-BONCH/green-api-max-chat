export function Avatar({ title }: { title: string }) {
  const initial = title.startsWith('+')
    ? title.slice(-2)
    : title.slice(0, 1).toUpperCase();
  return (
    <span className="avatar" aria-hidden="true">
      {initial}
    </span>
  );
}
