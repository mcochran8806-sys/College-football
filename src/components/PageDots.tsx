interface Props {
  count: number;
  active: number;
}

export default function PageDots({ count, active }: Props) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center gap-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={
            'block rounded-full transition-all duration-500 ' +
            (i === active ? 'h-2.5 w-6 bg-field-100' : 'h-2.5 w-2.5 bg-field-700')
          }
        />
      ))}
    </div>
  );
}
