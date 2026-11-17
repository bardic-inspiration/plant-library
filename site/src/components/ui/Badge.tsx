import { label } from '../../lib/vocab';

/** A form badge: the form's accent as a rule, the form's name as text. */
export function FormBadge({ form }: { form: string }) {
  return (
    <span class="badge" data-form={form}>
      {label('form', form)}
    </span>
  );
}

export function Badge({ children, kind }: { children: preact.ComponentChildren; kind?: string }) {
  return <span class={kind ? `badge badge-${kind}` : 'badge'}>{children}</span>;
}
