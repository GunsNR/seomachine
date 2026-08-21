import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  align?: 'left' | 'center';
  dark?: boolean;
  className?: string;
}

export function SectionHeading({
  eyebrow, title, sub, align = 'center', dark = false, className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'max-w-3xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow && <p className={cn('eyebrow mb-4', dark && 'eyebrow-dark')}>{eyebrow}</p>}
      <h2 className={cn('text-display-lg text-balance', dark && 'text-white')}>{title}</h2>
      {sub && (
        <p className={cn('mt-5 text-[1.0625rem] leading-[1.75] text-pretty', dark ? 'text-white/70' : 'text-body')}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function Section({
  children, className, dark = false, id,
}: {
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn('section', dark && 'bg-navy text-white/75', className)}>
      <div className="container-x">{children}</div>
    </section>
  );
}
