import { CircleCheck, Clock3 } from 'lucide-react';

export function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="module-placeholder">
      <span className="placeholder-mark">
        <Clock3 size={22} />
      </span>
      <p className="eyebrow">Platform roadmap</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="module-status">
        <CircleCheck size={16} /> This section will appear when its phase is implemented.
      </div>
    </section>
  );
}
